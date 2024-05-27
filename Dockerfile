# Build stage
FROM node:22-alpine AS build
ARG DEPLOY_ENV
ENV DEPLOY_ENV=${DEPLOY_ENV}
ENV PORT=7777

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN if [ "$DEPLOY_ENV" = "production" ] ; then sed -i 's#http://localhost:7777/#https://iuga.info/#' src/authConfig.js ; fi
RUN if [ "$DEPLOY_ENV" = "staging" ] ; then sed -i 's#http://localhost:7777/#https://staging.iuga.info/#' src/authConfig.js ; fi
RUN if [ "$DEPLOY_ENV" = "development" ] ; then sed -i 's#http://localhost:7777/#https://dev.iuga.info/#' src/authConfig.js ; fi
RUN npm run build


# Production stage
FROM node:22-alpine
RUN apk add --no-cache tzdata
RUN apk add --no-cache tzdata git
ENV TZ=America/Los_Angeles
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./
COPY --from=build /app/frontend/build /app/frontend/build
EXPOSE $PORT
CMD ["npm", "run", "deploy"]