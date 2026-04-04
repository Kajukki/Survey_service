# survey-service — API (scaffold)
FROM node:20-alpine
WORKDIR /app
RUN echo "console.log('survey-service api scaffold');" > index.js
CMD ["node", "index.js"]
