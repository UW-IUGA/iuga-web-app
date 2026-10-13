# syntax=docker/dockerfile:1
# Build stage
FROM node:22-alpine AS build
ARG DEPLOY_ENV
ARG VITE_API_URL
ENV DEPLOY_ENV=${DEPLOY_ENV}
ENV VITE_API_URL=${VITE_API_URL}
ENV PORT=7777

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./

RUN npm run build


# Production stage
FROM node:22-alpine
RUN apk add --no-cache tzdata git
ENV TZ=America/Los_Angeles
WORKDIR /app/backend
COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY backend/ ./
COPY --from=build /app/frontend/build /app/frontend/build
EXPOSE $PORT
CMD ["npm", "run", "deploy"]
