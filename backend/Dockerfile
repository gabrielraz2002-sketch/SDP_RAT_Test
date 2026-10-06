FROM node:20-alpine

# Install git (required for repo cloning and git operations)
RUN apk add --no-cache git

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

EXPOSE 3001

CMD ["node", "src/index.js"]
