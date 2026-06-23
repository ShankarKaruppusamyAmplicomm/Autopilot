FROM node:20-alpine

# better-sqlite3 needs native build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install only the deps needed for the local server
COPY package-local.json package.json
RUN npm install

COPY src/schema.sql src/schema.sql
COPY server.mjs server.mjs

EXPOSE 8787

CMD ["node", "server.mjs"]
