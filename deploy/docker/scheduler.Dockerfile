# survey-service — scheduler (scaffold)
FROM node:20-alpine
WORKDIR /app
RUN echo "console.log('survey-service scheduler scaffold');" > index.js
CMD ["node", "index.js"]
