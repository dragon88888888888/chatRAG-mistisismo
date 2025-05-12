import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
dotenv.config();

// Importa tu sistema beta y el procesador de PDFs
import { AgenticRAGSystem } from './rag-chat.js';
import pdfProcessor from './pdf-processor.js';

// Crea una instancia del bot con polling (sin necesidad de comandos /start)
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error("Falta TELEGRAM_BOT_TOKEN en las variables de entorno");
}
const bot = new TelegramBot(token, { polling: true });

// Inicializa tu sistema beta y el procesador de PDFs
const agenticRAG = new AgenticRAGSystem();
const tempDir = path.join(os.tmpdir(), 'telegram_downloads');

// Inicializar el vector store al arrancar
(async () => {
    try {
        // Crear directorio temporal si no existe
        await fs.mkdir(tempDir, { recursive: true });

        // Inicializar vector store para el RAG
        await agenticRAG.initVectorStore();

        // Inicializar processor de PDFs
        await pdfProcessor.initVectorStore();

        console.log("Bot de Telegram iniciado y vector stores inicializados.");

        // Notificar al proceso principal que el bot está listo
        if (process.send) {
            process.send('ready');
        }
    } catch (error) {
        console.error("Error inicializando:", error);
        process.exit(1);
    }
})();

// Manejador de mensajes
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Si se recibe texto
    if (msg.text) {
        // Si el mensaje es "/start", enviar mensaje de bienvenida y no procesar consulta
        if (msg.text.trim().toLowerCase() === '/start') {
            const welcomeMessage = "¡Bienvenido a Chettry Bot! puedes enviarme archivos PDF para ampliar mi conocimiento.";
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
    // Si se recibe un documento (PDF)
    else if (msg.document) {
        const document = msg.document;
        const fileId = document.file_id;
        const fileName = document.file_name || `documento_${Date.now()}.pdf`;

        // Verificar si es un PDF
        if (!fileName.toLowerCase().endsWith('.pdf')) {
            bot.sendMessage(chatId, "Solo puedo procesar archivos PDF. Por favor, envía un documento en formato PDF.");
            return;
        }

        try {
            // Informar al usuario que estamos procesando el PDF
            const processingMsg = await bot.sendMessage(chatId, `📝 Procesando el PDF "${fileName}"... Esto puede tomar un momento.`);

            // Obtener información del archivo
            const fileInfo = await bot.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;

            // Descargar el archivo
            const response = await fetch(fileUrl);
            const fileBuffer = Buffer.from(await response.arrayBuffer());

            // Procesar el PDF
            const result = await pdfProcessor.processPDF(fileBuffer, fileName);

            if (result.success) {
                await bot.editMessageText(
                    `✅ ¡PDF procesado con éxito!\n\n${result.message}\n\nAhora puedes hacerme preguntas sobre el contenido de este documento.`,
                    { chat_id: chatId, message_id: processingMsg.message_id }
                );
            } else {
                await bot.editMessageText(
                    `❌ Error al procesar el PDF: ${result.message}`,
                    { chat_id: chatId, message_id: processingMsg.message_id }
                );
            }
        } catch (error) {
            console.error('Error procesando el documento:', error);
            bot.sendMessage(chatId, "Ocurrió un error al procesar el documento. Por favor, intenta nuevamente.");
        }
    }
    // Si se recibe audio (voice)
    else if (msg.voice) {
        bot.sendMessage(chatId, "Lo siento, aún no soporto entrada de audio.");
    }
    // Si se recibe una imagen
    else if (msg.photo) {
        bot.sendMessage(chatId, "Lo siento, la funcionalidad para procesar imágenes aún no está implementada.");
    }
});

// Manejo de errores
bot.on('polling_error', (error) => {
    console.error('Error de polling en Telegram:', error);
});

// Manejo de cierre
process.on('SIGINT', () => {
    bot.stopPolling();
    console.log('Bot de Telegram detenido');
    process.exit(0);
});

process.on('SIGTERM', () => {
    bot.stopPolling();
    console.log('Bot de Telegram detenido');
    process.exit(0);
});