import express from 'express';
import fetch from 'node-fetch';
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
                throw new Error(`Error enviando mensaje: ${response.statusText}`);
            }

            console.log('Mensaje enviado correctamente');
            return response.json();
        } catch (error) {
            console.error('Error al enviar mensaje:', error);
            throw error;
        }
    }

    // Método para descargar archivos desde WhatsApp
    async downloadMedia(mediaId) {
        try {
            const response = await fetch(`${this.API_URL}/media/${mediaId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
                }
            });

            if (!response.ok) {
                throw new Error(`Error descargando media: ${response.statusText}`);
            }

            const mediaData = await response.json();

            // Obtener la URL real del archivo
            const mediaUrl = mediaData.url;

            // Descargar el archivo
            const fileResponse = await fetch(mediaUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
                }
            });

            if (!fileResponse.ok) {
                throw new Error(`Error descargando archivo: ${fileResponse.statusText}`);
            }

            return await fileResponse.buffer();
        } catch (error) {
            console.error('Error al descargar media:', error);
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
        const data = req.body;
        console.log('Datos del webhook entrante:', JSON.stringify(data, null, 2));

        // Extraer el mensaje
        const entry = data.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages = value?.messages;

        if (messages && messages.length > 0) {
            const message = messages[0];
            const senderPhone = message.from;

            // Procesar mensajes de texto
            if (message.type === 'text') {
                const text = message.text?.body;

                console.log(`Mensaje recibido de ${senderPhone}: ${text}`);

                // Verificar si es el mensaje de bienvenida
                if (text.trim().toLowerCase() === 'hola' || text.trim().toLowerCase() === 'start') {
                    const welcomeMessage = "¡Bienvenido a Chettry Bot en WhatsApp! puedes enviarme archivos PDF para ampliar mi conocimiento.";
                    await whatsappClient.sendTextMessage(welcomeMessage, senderPhone);
                } else {
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
                const document = message.document;
                const mediaId = document.id;
                const fileName = document.filename || `documento_${Date.now()}.pdf`;
                const mimeType = document.mime_type;

                // Verificar si es un PDF
                if (mimeType !== 'application/pdf' && !fileName.toLowerCase().endsWith('.pdf')) {
                    await whatsappClient.sendTextMessage("Solo puedo procesar archivos PDF. Por favor, envía un documento en formato PDF.", senderPhone);
                    res.sendStatus(200);
                    return;
                }

                try {
                    // Informar al usuario que estamos procesando el PDF
                    await whatsappClient.sendTextMessage(`📝 Procesando el PDF "${fileName}"... Esto puede tomar un momento.`, senderPhone);

                    // Descargar el archivo
                    const fileBuffer = await whatsappClient.downloadMedia(mediaId);

                    // Procesar el PDF
                    const result = await pdfProcessor.processPDF(fileBuffer, fileName);

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
                    console.error('Error procesando el documento:', error);
                    await whatsappClient.sendTextMessage("Ocurrió un error al procesar el documento. Por favor, intenta nuevamente.", senderPhone);
                }
            }
            // Si se recibe audio
            else if (message.type === 'audio' || message.type === 'voice') {
                await whatsappClient.sendTextMessage("Lo siento, aún no soporto entrada de audio.", senderPhone);
            }
            // Si se recibe una imagen
            else if (message.type === 'image') {
                await whatsappClient.sendTextMessage("Lo siento, la funcionalidad para procesar imágenes aún no está implementada.", senderPhone);
            }
        }

        // WhatsApp requiere una respuesta 200 para confirmar la recepción
        res.sendStatus(200);
    } catch (error) {
        console.error('Error procesando webhook:', error);
        res.sendStatus(500);
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