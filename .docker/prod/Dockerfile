FROM node:22-alpine AS builder
WORKDIR /app
COPY react/package*.json ./
RUN npm ci
COPY react/ .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./ 
CMD ["tail", "-f", "/dev/null"]
