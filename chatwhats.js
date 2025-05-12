import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

// Importa tu sistema beta (ajusta la ruta según tu proyecto)
import { AgenticRAGSystem } from './rag-chat.js';

// Configuración de WhatsApp
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_CLOUD_NUMBER_ID = process.env.WHATSAPP_CLOUD_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;

if (!WHATSAPP_API_TOKEN || !WHATSAPP_CLOUD_NUMBER_ID || !WEBHOOK_VERIFY_TOKEN) {
    throw new Error("Faltan variables de entorno necesarias");
}

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
        await agenticRAG.initVectorStore();
        console.log("WhatsApp Bot iniciado y vector store inicializado.");
    } catch (error) {
        console.error("Error inicializando vector store:", error);
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

            // Procesar solo mensajes de texto
            if (message.type === 'text') {
                const senderPhone = message.from;
                const text = message.text?.body;

                console.log(`Mensaje recibido de ${senderPhone}: ${text}`);

                // Verificar si es el mensaje de bienvenida
                if (text.trim().toLowerCase() === 'hola' || text.trim().toLowerCase() === 'start') {
                    const welcomeMessage = "¡Bienvenido a ChatMistery Bot en WhatsApp! Por el momento la información que tengo es sobre libros como: 'El libro tibetano de la vida y de la muerte (Sogyal Rimpoche)', 'Illuminati: los secretos de la secta más temida' y 'Todos los evangelios - AA VV'. ¡Pregúntame lo que quieras!";
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
            } else if (message.type === 'audio') {
                const senderPhone = message.from;
                await whatsappClient.sendTextMessage("Lo siento, aún no soporto entrada de audio.", senderPhone);
            } else if (message.type === 'image') {
                const senderPhone = message.from;
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
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
});