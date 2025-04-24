import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Update CORS configuration to allow requests from both ports
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'], // Allow both development ports
  methods: ['POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set in the environment variables.');
  process.exit(1);
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.post("/api/chat", async (req, res) => {
  console.log('Received chat request');
  
  const { messages } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request format. Messages array is required.' });
  }

  try {
    // Format messages for Claude API
    const formattedMessages = messages.map(msg => {
      const formattedMsg = {
        role: msg.role,
        content: msg.content
      };

      // Handle images if present
      if (msg.images && msg.images.length > 0) {
        formattedMsg.content = [{
          type: "text",
          text: msg.content || ""
        }];

        // Add image media blocks
        msg.images.forEach(image => {
          formattedMsg.content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: model
            }
          });
        });
      }

      return formattedMsg;
    });

    // Make request to Claude
    const response = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      max_tokens: 2024,
      messages: formattedMessages,
    });

    console.log('Anthropic API response received');

    res.json({
      content: [{
        text: response.content[0].text
      }]
    });

  } catch (error) {
    console.error('Server Error:', error);
    if (error instanceof Anthropic.APIError) {
      res.status(error.status || 500).json({
        error: 'Anthropic API Error',
        details: error.message,
        type: error.type
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});