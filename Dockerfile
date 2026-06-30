FROM node:20

WORKDIR /app

# The official Node image already has a 'node' user with UID 1000.
# We will use it directly to avoid permission errors.
COPY --chown=node:node package*.json ./

RUN npm install --omit=dev

COPY --chown=node:node . .

# Switch to the pre-existing node user
USER node

EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]
