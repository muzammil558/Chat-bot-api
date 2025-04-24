import { useState, useEffect, useRef } from "react";
import {
  Send,
  User,
  Bot,
  Minimize2,
  Maximize2,
  Copy,
  Files,
  Play,
  RefreshCw,
  ImageIcon
} from "lucide-react";
import "./chatInterface.css";

const API_URL = "http://localhost:3000/api/chat";

// Function to extract file information from code blocks
const parseCodeBlocks = (content) => {
  const fileRegex = /```(\w+)\s*(?:\{filename:\s*"([^"]+)"\})?\n([\s\S]*?)```/g;
  const files = [];
  let match;

  while ((match = fileRegex.exec(content)) !== null) {
    const language = match[1];
    const filename = match[2] || `file.${language}`;
    const code = match[3].trim();
    files.push({ language, filename, code });
  }

  // Get remaining text without code blocks
  const textContent = content.replace(fileRegex, "").trim();

  return { files, textContent };
};

// Function to combine files into a single HTML document
const combineFiles = (files) => {
  let htmlContent = "";
  let cssContent = "";
  let jsContent = "";

  files.forEach((file) => {
    if (file.filename.endsWith(".html")) {
      htmlContent = file.code;
    } else if (file.filename.endsWith(".css")) {
      cssContent += file.code;
    } else if (
      file.filename.endsWith(".js") ||
      file.filename.endsWith(".jsx")
    ) {
      jsContent += file.code;
    }
  });

  // If no HTML file exists, create a basic HTML structure
  if (!htmlContent) {
    htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Preview</title>
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>
    `;
  }

  // Insert CSS and JS into the HTML
  const fullHTML = htmlContent
    .replace("</head>", `<style>${cssContent}</style></head>`)
    .replace("</body>", `<script>${jsContent}</script></body>`);

  return fullHTML;
};

function SplitView() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I'm ready to help you create and preview code. How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [activeFile, setActiveFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [previewMode, setPreviewMode] = useState("code");
  const [combinedPreview, setCombinedPreview] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const convertImageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    const maxSize = 5 * 1024 * 1024; // 5MB
  
    if (file.size > maxSize) {
      setError("Image size too large. Please select an image under 5MB.");
      return;
    }
  
    if (file) {
      try {
        const base64Image = await convertImageToBase64(file);
        const compressedImage = await compressImage(base64Image);
        setSelectedImage(compressedImage);
        setImagePreview(URL.createObjectURL(file));
      } catch (error) {
        console.error("Error converting image:", error);
        setError("Failed to process image");
      }
    }
  };
  const compressImage = async (base64Image, maxSizeMB = 1) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Image;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
  
        // Calculate new dimensions while maintaining aspect ratio
        const maxDimension = 1024; // You can adjust this value
        if (width > height && width > maxDimension) {
          height *= maxDimension / width;
          width = maxDimension;
        } else if (height > maxDimension) {
          width *= maxDimension / height;
          height = maxDimension;
        }
  
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Adjust quality as needed (0.7 is a good balance)
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  };
  useEffect(() => {
    if (files.length > 0) {
      const combined = combineFiles(files);
      setCombinedPreview(combined);
    }
  }, [files]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError("");
    const userMessage = {
      role: "user",
      content: input,
      images: selectedImage ? [selectedImage] : undefined,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setIsPanelExpanded(true);
    setSelectedImage(null);
    setImagePreview(null);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 2024,
          messages: newMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            images: msg.images,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content[0].text;

      // Parse code blocks and text content
      const { files: newFiles, textContent } = parseCodeBlocks(content);

      // Update messages with text content only
      const assistantMessage = {
        role: "assistant",
        content: textContent,
      };
      setMessages([...newMessages, assistantMessage]);

      // Update files
      if (newFiles.length > 0) {
        setFiles(newFiles);
        setActiveFile(newFiles[0]);
        setIsPanelExpanded(true);
      }
    } catch (err) {
      console.error("Error:", err);
      setError(`An error occurred: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.code);
      setIsCodeCopied(true);
      setTimeout(() => setIsCodeCopied(false), 2000);
    }
  };

  const togglePanel = () => {
    setIsPanelExpanded(!isPanelExpanded);
  };

  const getFileIcon = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    switch (ext) {
      case "html":
        return "🌐";
      case "css":
        return "🎨";
      case "js":
      case "jsx":
        return "⚡";
      case "json":
        return "📦";
      default:
        return "📄";
    }
  };
  const handleRefreshPreview = () => {
    setRefreshKey((prev) => prev + 1); // Increment to force iframe refresh
  };
  // Preview Frame component with error boundary
  const PreviewFrame = () => {
    const iframeRef = useRef(null);

    // Function to combine HTML, CSS, and JS files
    const combineFiles = (files) => {
      let htmlContent = "";
      let cssContent = "";
      let jsContent = "";

      // Sort files to ensure HTML is processed first
      const sortedFiles = [...files].sort((a, b) => {
        if (a.filename.endsWith(".html")) return -1;
        if (b.filename.endsWith(".html")) return 1;
        return 0;
      });

      sortedFiles.forEach((file) => {
        if (file.filename.endsWith(".html")) {
          htmlContent = file.code;
        } else if (file.filename.endsWith(".css")) {
          cssContent += file.code;
        } else if (
          file.filename.endsWith(".js") ||
          file.filename.endsWith(".jsx")
        ) {
          jsContent += file.code;
        }
      });

      // Create default HTML structure if none exists
      if (!htmlContent) {
        htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>Preview</title>
            </head>
            <body>
              <div id="root"></div>
            </body>
          </html>
        `;
      }

      // Insert CSS in the head and JS before body end
      const fullHTML = htmlContent
        .replace("</head>", `<style>${cssContent}</style></head>`)
        .replace("</body>", `<script>${jsContent}</script></body>`);

      return fullHTML;
    };

    useEffect(() => {
      if (iframeRef.current && files.length > 0) {
        try {
          const combinedCode = combineFiles(files);
          const iframe = iframeRef.current;
          const iframeDoc =
            iframe.contentDocument || iframe.contentWindow.document;

          // Set the content and execute scripts
          iframe.srcdoc = combinedCode;

          // Handle load event to ensure content is rendered
          iframe.onload = () => {
            // Add any additional initialization if needed
            console.log("Preview loaded successfully");
          };
        } catch (error) {
          console.error("Preview error:", error);
        }
      }
    }, [files, refreshKey]);

    return (
      <div className="preview-frame-container">
        <iframe
          ref={iframeRef}
          title="preview"
          sandbox="allow-scripts allow-same-origin"
          className="preview-frame"
          width="100%"
          height="100%"
        />
      </div>
    );
  };

  return (
    <div className="split-container">
      {/* Chat panel section remains the same */}
      <div className="chat-panel">
        <div className="chat-header">
          <h1 className="header-text">Irenic Tech</h1>
        </div>

        <div className="messages-container">
          {error && <div className="alert">{error}</div>}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`message ${
                message.role === "user" ? "message-user" : ""
              }`}
            >
              <div
                className={`avatar ${
                  message.role === "user" ? "avatar-user" : "avatar-assistant"
                }`}
              >
                {message.role === "user" ? (
                  <User className="avatar-icon" />
                ) : (
                  <Bot className="avatar-icon" />
                )}
              </div>
              <div
                className={`message-bubble ${
                  message.role === "user"
                    ? "message-bubble-user"
                    : "message-bubble-assistant"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="loading-indicator">
              <div className="loading-dot" />
              <div className="loading-dot" />
              <div className="loading-dot" />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <div className="input-container">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="chat-input"
            />
            <label className="upload-button">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
              <ImageIcon size={20} />
            </label>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="send-button"
            >
              <Send size={20} />
            </button>
          </div>
          {imagePreview && (
            <div className="image-preview">
              <img src={imagePreview} alt="Preview" />
              <button
                onClick={() => {
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
              >
                ×
              </button>
            </div>
          )}
        </form>
      </div>

      {isPanelExpanded && files.length > 0 && (
        <div
          className={`preview-panel ${isPanelExpanded ? "panel-expanded" : ""}`}
        >
          <div className="preview-header">
            <div className="preview-tabs">
              {files.map((file, index) => (
                <button
                  key={index}
                  className={`preview-tab ${
                    activeFile === file ? "active" : ""
                  }`}
                  onClick={() => setActiveFile(file)}
                >
                  {getFileIcon(file.filename)} {file.filename}
                </button>
              ))}
            </div>
            <div className="preview-actions">
              <button
                className={`preview-button ${
                  previewMode === "code" ? "active" : ""
                }`}
                onClick={() => setPreviewMode("code")}
                title="Show code"
              >
                <Files size={18} />
              </button>
              <button
                className={`preview-button ${
                  previewMode === "preview" ? "active" : ""
                }`}
                onClick={() => setPreviewMode("preview")}
                title="Show preview"
              >
                <Play size={18} />
              </button>
              {previewMode === "preview" && (
                <button
                  className="preview-button"
                  onClick={handleRefreshPreview}
                  title="Refresh preview"
                >
                  <RefreshCw size={18} />
                </button>
              )}
              <button
                className="preview-button"
                onClick={handleCopyCode}
                title="Copy code"
              >
                <Copy size={18} />
                {isCodeCopied && <span className="copy-tooltip">Copied!</span>}
              </button>
              <button
                className="preview-button"
                onClick={togglePanel}
                title="Toggle panel"
              >
                {isPanelExpanded ? (
                  <Minimize2 size={18} />
                ) : (
                  <Maximize2 size={18} />
                )}
              </button>
            </div>
          </div>
          <div className="preview-content">
            {previewMode === "code" ? (
              <pre className="preview-text">{activeFile?.code}</pre>
            ) : (
              <PreviewFrame />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SplitView;
