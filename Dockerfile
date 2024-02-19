# Build stage
FROM node:21-alpine as build

WORKDIR /app
COPY . .
RUN npm run build

# Nginx stage
FROM nginx:1.25.4-alpine
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

