# Realms: serves our own client. No build step needed at runtime — dist/game.js
# is the esbuild bundle produced from game/src.
FROM node:22-alpine
WORKDIR /app
COPY game ./game
ENV PORT=10000
EXPOSE 10000
CMD ["node", "game/server.mjs"]
