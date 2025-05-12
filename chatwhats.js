import express from 'express';
import fetch from 'node-fetch';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
dotenv.config();

// Importa tu sistema beta y el procesador de PDFs
import { AgenticRAGSystem } from './rag-chat.js';
import pdfProcessor from './pdf-processor.js';

// Configuración de WhatsApp
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_CLOUD_NUMBER_ID = process.env.WHATSAPP_CLOUD_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const PORT = process.env.WHATSAPP_PORT || 5000;

if (!WHATSAPP_API_TOKEN || !WHATSAPP_CLOUD_NUMBER_ID || !WEBHOOK_VERIFY_TOKEN) {
    throw new Error("Faltan variables de entorno necesarias para WhatsApp");
}

// Directorio temporal para archivos descargados
const tempDir = path.join(os.tmpdir(), 'whatsapp_downloads');

// Clase para manejar la API de WhatsApp
class WhatsAppClient {
    constructor() {
        this.API_URL = `https://graph.facebook.com/v20.0/${WHATSAPP_CLOUD_NUMBER_ID}`;
        this.headers = {
            'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
        };
    }

    async sendTextMessage(message, phoneNumber) {
        const payload = {
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'text',
            text: {
                preview_url: false,
                body: message
            }
        };

        try {
            const response = await fetch(`${this.API_URL}/messages`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error enviando mensaje: ${response.statusText} - ${errorText}`);
            }

            console.log('Mensaje enviado correctamente');
            return response.json();
        } catch (error) {
            console.error('Error al enviar mensaje:', error);
            throw error;
        }
    }

    // Método mejorado para descargar medios usando axios
    async downloadMedia(mediaId) {
        try {
            console.log(`Intentando obtener URL del medio con ID: ${mediaId}`);

            // Paso 1: Obtener la URL del medio
            const metadataUrl = `https://graph.facebook.com/v20.0/${mediaId}`;
            console.log(`URL de metadatos: ${metadataUrl}`);

            const metadataResponse = await axios.get(metadataUrl, {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
                }
            });

            if (!metadataResponse.data || !metadataResponse.data.url) {
                throw new Error('No se pudo obtener la URL del medio');
            }

            console.log(`URL del medio obtenida: ${metadataResponse.data.url}`);

            // Paso 2: Descargar el archivo usando la URL obtenida
            const mediaUrl = metadataResponse.data.url;

            // Importante: Usar User-Agent correcto
            const mediaResponse = await axios.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
                    'User-Agent': 'WhatsApp/2.19.81 A'
                },
                responseType: 'arraybuffer'
            });

            console.log(`Medio descargado: ${mediaResponse.data.byteLength} bytes`);

            return Buffer.from(mediaResponse.data);
        } catch (error) {
            console.error('Error al descargar el medio:', error.message);
            if (error.response) {
                console.error('Detalles de la respuesta:', {
                    status: error.response.status,
                    headers: error.response.headers,
                    data: error.response.data
                });
            }
            throw new Error(`Error al descargar el medio: ${error.message}`);
        }
    }

    // Método para descargar PDFs de URLs
    async downloadPdfFromUrl(url) {
        try {
            console.log(`Descargando PDF desde URL: ${url}`);

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            // Verificar que sea un PDF
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.includes('application/pdf')) {
                console.warn(`El contenido descargado no es un PDF. Content-Type: ${contentType}`);
                // Continuamos de todos modos, ya que algunas URLs no configuran bien el Content-Type
            }

            return Buffer.from(response.data);
        } catch (error) {
            console.error('Error al descargar PDF desde URL:', error.message);
            throw error;
        }
    }
}

// Crear aplicación Express
const app = express();
app.use(express.json());

// Inicializar cliente de WhatsApp
const whatsappClient = new WhatsAppClient();

// Inicializar tu sistema RAG
const agenticRAG = new AgenticRAGSystem();

// Inicializar el vector store al arrancar
(async () => {
    try {
        // Crear directorio temporal si no existe
        await fs.mkdir(tempDir, { recursive: true });

        // Inicializar vector store para el RAG
        await agenticRAG.initVectorStore();

        // Inicializar processor de PDFs
        await pdfProcessor.initVectorStore();

        console.log("WhatsApp Bot iniciado y vector stores inicializados.");

        // Notificar al proceso principal que el bot está listo
        if (process.send) {
            process.send('ready');
        }
    } catch (error) {
        console.error("Error inicializando:", error);
        process.exit(1);
    }
})();

// Ruta principal
app.get('/', (req, res) => {
    res.send('<h1>WhatsApp Bot con RAG está funcionando</h1>');
});

// Webhook de WhatsApp
app.get('/webhook', (req, res) => {
    // Verificación del webhook
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('Webhook verificado exitosamente');
        res.status(200).send(challenge);
    } else {
        console.error('Verificación de webhook fallida');
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    try {
        // WhatsApp requiere una respuesta 200 INMEDIATA para confirmar la recepción
        // Enviamos la respuesta de inmediato y procesamos el mensaje en segundo plano
        res.sendStatus(200);

        const data = req.body;
        console.log('Datos del webhook entrante:', JSON.stringify(data, null, 2));

        // Extraer el mensaje
        const entry = data.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;

        if (!messages || messages.length === 0) {
            console.log('No hay mensajes para procesar');
            return;
        }

        const message = messages[0];
        const senderPhone = message.from;

        if (!senderPhone) {
            console.log('Número de teléfono de remitente no encontrado');
            return;
        }

        // Procesar mensajes de texto
        if (message.type === 'text') {
            const text = message.text?.body;

            if (!text) {
                console.log('Texto del mensaje no encontrado');
                return;
            }

            console.log(`Mensaje recibido de ${senderPhone}: ${text}`);

            // Verificar si es el mensaje de bienvenida
            if (text.trim().toLowerCase() === 'hola' || text.trim().toLowerCase() === 'start') {
                const welcomeMessage = "¡Bienvenido a ChatMistery Bot en WhatsApp! Por el momento la información que tengo es sobre libros como: 'El libro tibetano de la vida y de la muerte (Sogyal Rimpoche)', 'Illuminati: los secretos de la secta más temida' y 'Todos los evangelios - AA VV'. ¡Pregúntame lo que quieras!\n\nTambién puedes compartir enlaces a PDFs usando el formato: \"pdf: URL_DEL_PDF\"";
                await whatsappClient.sendTextMessage(welcomeMessage, senderPhone);
            }
            // Verificar si es un enlace a un PDF
            else if (text.trim().toLowerCase().startsWith('pdf:')) {
                const pdfUrl = text.trim().substring(4).trim();

                if (!pdfUrl || !pdfUrl.includes('http')) {
                    await whatsappClient.sendTextMessage("Por favor, proporciona una URL válida después de 'pdf:'. Por ejemplo: pdf: https://drive.google.com/file/d/abc123/view", senderPhone);
                    return;
                }

                try {
                    await whatsappClient.sendTextMessage(`📝 Descargando PDF desde: ${pdfUrl}...`, senderPhone);

                    // Descargar el PDF desde la URL
                    const pdfBuffer = await whatsappClient.downloadPdfFromUrl(pdfUrl);

                    // Generar un nombre para el archivo
                    const fileName = `doc_${Date.now()}.pdf`;

                    // Procesar el PDF
                    const result = await pdfProcessor.processPDF(pdfBuffer, fileName);

                    if (result.success) {
                        await whatsappClient.sendTextMessage(
                            `✅ ¡PDF procesado con éxito!\n\n${result.message}\n\nAhora puedes hacerme preguntas sobre el contenido de este documento.`,
                            senderPhone
                        );
                    } else {
                        await whatsappClient.sendTextMessage(
                            `❌ Error al procesar el PDF: ${result.message}`,
                            senderPhone
                        );
                    }
                } catch (error) {
                    console.error("Error procesando URL de PDF:", error);
                    await whatsappClient.sendTextMessage(`Error al procesar la URL: ${error.message}`, senderPhone);
                }
            }
            else {
                // Procesar la consulta con tu sistema RAG
                try {
                    const response = await agenticRAG.processQuery(text);
                    await whatsappClient.sendTextMessage(response.answer, senderPhone);
                } catch (err) {
                    console.error("Error procesando la consulta:", err);
                    await whatsappClient.sendTextMessage("Ocurrió un error al procesar tu consulta.", senderPhone);
                }
            }
        }
        // Procesar documentos (PDFs)
        else if (message.type === 'document') {
            if (!message.document) {
                console.log('Datos del documento no encontrados');
                return;
            }

            const document = message.document;
            const fileName = document.filename || `documento_${Date.now()}.pdf`;

            // Informar al usuario sobre las limitaciones actuales de procesamiento directo
            await whatsappClient.sendTextMessage(
                `Lo siento, actualmente la API de WhatsApp tiene restricciones para la descarga directa de documentos.\n\nPuedes subir tu PDF "${fileName}" a Google Drive o similar y compartir el enlace conmigo usando el formato: "pdf: URL_DEL_PDF"`,
                senderPhone
            );
        }
        // Si se recibe audio
        else if (message.type === 'audio' || message.type === 'voice') {
            await whatsappClient.sendTextMessage("Lo siento, aún no soporto entrada de audio.", senderPhone);
        }
        // Si se recibe una imagen
        else if (message.type === 'image') {
            await whatsappClient.sendTextMessage("Lo siento, la funcionalidad para procesar imágenes aún no está implementada.", senderPhone);
        } else {
            console.log(`Tipo de mensaje no soportado: ${message.type}`);
        }
    } catch (error) {
        console.error('Error procesando webhook:', error);
    }
});

// Ruta adicional para probar el envío de mensajes
app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Se requiere phone y message' });
    }

    try {
        const result = await whatsappClient.sendTextMessage(message, phone);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Iniciar servidor
const server = app.listen(PORT, () => {
    console.log(`Servidor de WhatsApp ejecutándose en puerto ${PORT}`);
});

// Manejo de cierre
process.on('SIGINT', () => {
    server.close();
    console.log('Servidor de WhatsApp detenido');
    process.exit(0);
});

process.on('SIGTERM', () => {
    server.close();
    console.log('Servidor de WhatsApp detenido');
    process.exit(0);
});

// Exportar para que el archivo pueda ser usado como módulo
export default app;