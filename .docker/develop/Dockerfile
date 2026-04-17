FROM node:22-alpine
WORKDIR /app
COPY react/package*.json ./
RUN npm install
COPY react/ .
CMD ["npm", "run", "dev"]
