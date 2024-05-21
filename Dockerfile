# Build stage
FROM node:22-alpine AS build
ENV PORT=7777
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build


# Production stage
FROM node:22-alpine
RUN apk add --no-cache tzdata
ENV TZ=America/Los_Angeles
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
COPY --from=build /app/frontend/build /app/frontend/build
ENV API_URL="https://dev.iuga.info"
EXPOSE $PORT
CMD ["npm", "run", "deploy"]