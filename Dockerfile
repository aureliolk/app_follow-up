# Stage 1: Base Node image
FROM node:20-alpine AS base
# Install pnpm
RUN npm install -g pnpm
WORKDIR /app

# Stage 2: Install all dependencies
FROM base AS deps
# Copy the entire source code first
COPY . .
# Install dependencies using pnpm, considering the workspace structure
RUN pnpm install --frozen-lockfile

# Stage 3: Build the application (includes Prisma generate)
FROM deps AS builder
# Generate Prisma Client (needs full source and deps from 'deps' stage)
RUN pnpm exec prisma generate
# Build the application
RUN pnpm run build

# Stage 4: Production image (previously Stage 5)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN npm install -g pnpm # pnpm needed to run start command

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from the builder stage
# --- Monorepo Structure Adjustments --- 
# Copy the main application's build artifacts
COPY --from=builder /app/apps/next-app/.next ./.next
COPY --from=builder /app/apps/next-app/public ./public
# Copy the main application's package.json (contains the start script)
COPY --from=builder /app/apps/next-app/package.json ./package.json
# Copy root workspace files needed by pnpm
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml* ./ 
# Copy node_modules (already includes Prisma client from the build stage)
COPY --from=builder /app/node_modules ./node_modules
# Copy Prisma schema and migrations for runtime deployment
COPY --from=builder /app/prisma ./prisma

# Change ownership of necessary files for the non-root user
RUN chown -R nextjs:nodejs /app/.next
# Consider chowning node_modules if your app needs to write there at runtime
# RUN chown -R nextjs:nodejs /app/node_modules

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["pnpm", "run", "start"] 