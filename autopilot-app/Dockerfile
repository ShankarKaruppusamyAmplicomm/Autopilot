FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_API_URL is passed as build arg so it gets baked into the bundle
ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=$VITE_API_URL

# Docker serves at /, not /Autopilot/ (which is the GitHub Pages path)
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE

RUN npm run build

# Serve the static build with a tiny HTTP server
FROM node:20-alpine AS serve
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/dist ./dist

EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
