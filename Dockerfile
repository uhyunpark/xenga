FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files and strip workspace config
# (server doesn't need web/ or packages/ workspaces)
COPY package.json ./
RUN sed -i '/"workspaces"/d' package.json

# Install server dependencies (no lockfile — workspace line was stripped)
RUN bun install --production

# Copy source code + compiled contract ABIs
COPY src/ src/
COPY contracts/out/ contracts/out/

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["bun", "run", "start"]
