# ChatMistery Bot

ChatMistery Bot es un bot de Telegram basado en inteligencia artificial que utiliza un sistema de Recuperación-Augmented Generation (RAG) para responder consultas y recomendar videos de YouTube relacionados con misticismo y sabiduría. El bot combina respuestas generadas a partir de textos clásicos con sugerencias multimedia para ofrecer una experiencia interactiva.

## Características
- **Respuestas Inteligentes**: Utiliza un sistema RAG con el modelo Gemini-2.0 Flash para generar respuestas contextualizadas.
- **Recomendación de Videos**: Extrae palabras clave de la respuesta para buscar en YouTube y recomendar videos relevantes (limitados a un canal, si se configura).
- **Gestión de Conversación**: Mantiene un historial de conversación para ofrecer respuestas coherentes y contextuales.
- **Fuentes de Conocimiento**: Se basa en libros esotéricos previamente cargados, usando Pinecone como gestor de la vectorstore.

## Requisitos
- Node.js (v14 o superior)
- Token de bot de Telegram (obtenido a través de BotFather)
- API Key para YouTube Data API v3 (desde Google Cloud Console)
- (Opcional) ID del canal de YouTube para restringir la búsqueda
- Configuración para Pinecone (con su correspondiente `PINECONE_INDEX`)
- API Key de Google (para el modelo Gemini-2.0 Flash)

## Instalación
1. Clona el repositorio:
   ```sh
   git clone https://github.com/dragon88888888888/chatRAG-mistisismo.git
   cd chatRAG-mistisismo
   ```
2. Instala las dependencias:
   ```sh
   npm install
   ```
3. Crea un archivo `.env` en la raíz del proyecto con las siguientes variables (modifica según tu configuración):
   ```ini
   TELEGRAM_BOT_TOKEN=TU_TELEGRAM_BOT_TOKEN
   YOUTUBE_API_KEY=TU_YOUTUBE_API_KEY
   YOUTUBE_CHANNEL_ID=TU_YOUTUBE_CHANNEL_ID
   PINECONE_INDEX=TU_PINECONE_INDEX
   GOOGLE_API_KEY=TU_GOOGLE_API_KEY
   ```

## Uso
Para iniciar el bot, ejecuta:
```sh
npm start
```
El bot se ejecutará en modo polling y responderá a los mensajes de Telegram. Al enviar `/start`, mostrará un mensaje de bienvenida. Luego, cualquier consulta de texto se procesará utilizando el sistema RAG, combinando la respuesta generada con la recomendación de video de YouTube.

## Contribución
¡Las contribuciones son bienvenidas! Si deseas mejorar el bot o agregar nuevas funcionalidades, abre un issue o pull request en el repositorio.

## Licencia
Este proyecto se distribuye bajo la licencia MIT.

