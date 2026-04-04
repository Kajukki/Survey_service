# survey-service — worker (scaffold)
FROM node:20-alpine
WORKDIR /app
RUN echo "console.log('survey-service worker scaffold — implement RabbitMQ consumer');" > index.js
CMD ["node", "index.js"]
