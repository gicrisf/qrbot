# Use the official Alpine-based Bun image
FROM oven/bun:alpine AS base
WORKDIR /usr/src/app

# Install dependencies into a temporary directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install production dependencies (exclude devDependencies)
FROM install AS prod
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Copy node_modules from temp directory and all project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Run tests
RUN bun test

# Copy production dependencies and source code into final image
FROM base AS release
COPY --from=prod /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/. .

# Run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "./src/index.ts"]
