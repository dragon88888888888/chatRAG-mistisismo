import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fork } from 'child_process';

dotenv.config();

// Obtener la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🤖 Iniciando los bots de mensajería...');

// Iniciar el bot de Telegram
const telegramBot = fork(join(__dirname, 'chattelegram.js'));
telegramBot.on('message', (message) => {
    if (message === 'ready') {
        console.log('✅ Bot de Telegram iniciado correctamente');
    }
});

// Iniciar el bot de WhatsApp
const whatsappBot = fork(join(__dirname, 'chattelegram.js'));
whatsappBot.on('message', (message) => {
    if (message === 'ready') {
        console.log('✅ Bot de WhatsApp iniciado correctamente');
    }
});

// Manejar errores y cierre de procesos
telegramBot.on('error', (error) => {
    console.error('❌ Error en el bot de Telegram:', error);
});

whatsappBot.on('error', (error) => {
    console.error('❌ Error en el bot de WhatsApp:', error);
});

// Manejar señales de cierre
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando los bots...');
    telegramBot.kill();
    whatsappBot.kill();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Cerrando los bots...');
    telegramBot.kill();
    whatsappBot.kill();
    process.exit(0);
});