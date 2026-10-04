FROM node:24-alpine
WORKDIR /app
COPY package.json apns.ts forwarder.ts main.ts ./
USER node
EXPOSE 8080
CMD ["node", "main.ts"]
