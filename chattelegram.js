import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
dotenv.config();

// Importa tu sistema beta (ajusta la ruta según tu proyecto)
import { AgenticRAGSystem } from './rag-chat.js';

// Crea una instancia del bot con polling (sin necesidad de comandos /start)
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error("Falta TELEGRAM_BOT_TOKEN en las variables de entorno");
}
const bot = new TelegramBot(token, { polling: true });

// Inicializa tu sistema beta
const agenticRAG = new AgenticRAGSystem();
await agenticRAG.initVectorStore();

console.log("Bot de Telegram iniciado.");

// Manejador de mensajes
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Si se recibe texto
    if (msg.text) {
        // Si el mensaje es "/start", enviar mensaje de bienvenida y no procesar consulta
        if (msg.text.trim().toLowerCase() === '/start') {
            const welcomeMessage = "¡Bienvenido a ChatMistery Bot! Por el momento la información que tengo es sobre libros como: 'El libro tibetano de la vida y de la muerte (Sogyal Rimpoche)', 'Illuminati: los secretos de la secta más temida' y 'Todos los evangelios - AA VV'. ¡Pregúntame lo que quieras!";
            bot.sendMessage(chatId, welcomeMessage);
            return;
        }

        console.log(`Mensaje recibido de ${chatId}: ${msg.text}`);
        try {
            const response = await agenticRAG.processQuery(msg.text);
            // Se envía el resultado combinado (respuesta RAG y video relacionado)
            bot.sendMessage(chatId, response.answer);
        } catch (err) {
            console.error("Error procesando la consulta:", err);
            bot.sendMessage(chatId, "Ocurrió un error al procesar tu consulta.");
        }
    }
    // Si se recibe audio (voice)
    else if (msg.voice) {
        bot.sendMessage(chatId, "Lo siento, aún no soporte entrada de audio.");
        // Aquí podrías implementar la lógica para descargar el archivo de voz,
        // transcribirlo y luego enviar el texto a tu sistema beta.
    }
    // Si se recibe una imagen
    else if (msg.photo) {
        bot.sendMessage(chatId, "Lo siento, la funcionalidad para procesar imágenes aún no está implementada.");
        // Aquí podrías agregar lógica para descargar la imagen y procesarla (ej. OCR).
    }
});
