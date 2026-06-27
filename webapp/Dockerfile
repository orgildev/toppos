FROM node:22-alpine

WORKDIR /app

# Install dependencies first (leverages Docker cache)
COPY package*.json ./
RUN npm install

# Copy source code and build the app
COPY . .
RUN npm run build

EXPOSE 3000

# Start Next.js server
CMD ["npm", "run", "start"]
