FROM node:20

# Create a non-root user to avoid permission issues on HuggingFace
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /app

# Copy package.json and package-lock.json with user permissions
COPY --chown=user package*.json ./

# Install packages (excluding devDependencies to make it lightweight)
RUN npm install --omit=dev

# Copy the rest of the application
COPY --chown=user . .

# Expose the standard Hugging Face port
EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]
