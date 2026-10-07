FROM oven/bun:1
WORKDIR /srv
COPY package.json ./
RUN bun install
COPY index.ts ./
EXPOSE 3003
CMD ["bun", "index.ts"]
