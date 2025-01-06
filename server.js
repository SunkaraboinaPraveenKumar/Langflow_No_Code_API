import  express from 'express';
import bodyParser from 'body-parser';
import { configDotenv } from 'dotenv';
configDotenv();
// Initialize Express app
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Define LangflowClient class (same as in your original code)
class LangflowClient {
    constructor(baseURL, applicationToken) {
        this.baseURL = baseURL;
        this.applicationToken = applicationToken;
    }

    async post(endpoint, body, headers = { "Content-Type": "application/json" }) {
        headers["Authorization"] = `Bearer ${this.applicationToken}`;
        headers["Content-Type"] = "application/json";
        const url = `${this.baseURL}${endpoint}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            const responseMessage = await response.json();
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText} - ${JSON.stringify(responseMessage)}`);
            }
            return responseMessage;
        } catch (error) {
            console.error('Request Error:', error.message);
            throw error;
        }
    }

    async initiateSession(flowId, langflowId, inputValue, inputType = 'chat', outputType = 'chat', stream = false, tweaks = {}) {
        const endpoint = `/lf/${langflowId}/api/v1/run/${flowId}?stream=${stream}`;
        return this.post(endpoint, { input_value: inputValue, input_type: inputType, output_type: outputType, tweaks: tweaks });
    }

    handleStream(streamUrl, onUpdate, onClose, onError) {
        const eventSource = new EventSource(streamUrl);

        eventSource.onmessage = event => {
            const data = JSON.parse(event.data);
            onUpdate(data);
        };

        eventSource.onerror = event => {
            console.error('Stream Error:', event);
            onError(event);
            eventSource.close();
        };

        eventSource.addEventListener("close", () => {
            onClose('Stream closed');
            eventSource.close();
        });

        return eventSource;
    }

    async runFlow(flowIdOrName, langflowId, inputValue, inputType = 'chat', outputType = 'chat', tweaks = {}, stream = false, onUpdate, onClose, onError) {
        try {
            const initResponse = await this.initiateSession(flowIdOrName, langflowId, inputValue, inputType, outputType, stream, tweaks);
            // Log the entire response object in readable format
            console.log('Init Response:', JSON.stringify(initResponse, null, 2));

            if (stream && initResponse && initResponse.outputs && initResponse.outputs[0].outputs[0].artifacts.stream_url) {
                const streamUrl = initResponse.outputs[0].outputs[0].artifacts.stream_url;
                console.log(`Streaming from: ${streamUrl}`);
                this.handleStream(streamUrl, onUpdate, onClose, onError);
            }

            return initResponse;
        } catch (error) {
            console.error('Error running flow:', error);
            onError('Error initiating session');
        }
    }
}

// Define API endpoint to handle POST requests
app.post('/generate', async (req, res) => {
    const { prompt, inputType = 'chat', outputType = 'chat', stream = false } = req.body;

    const flowIdOrName = 'fe95c51b-8c2d-4912-9c0a-2c0739d58916';
    const langflowId = '494a8fcf-d977-45a2-828c-2c29e72bbeae';
    const applicationToken = process.env.LANGFLOW_API_KEY;
    const langflowClient = new LangflowClient('https://api.langflow.astra.datastax.com', applicationToken);

    try {
        const tweaks = {
            "ChatInput-1QhsB": {},
            "ChatOutput-AdHyX": {},
            "Agent-MTbTs": {},
            "Prompt-jDLw0": {},
            "AstraDB-Y2h6g": {},
            "ParseData-knQrj": {},
            "SplitText-Q8vMx": {},
            "AstraDB-3ORBG": {},
            "File-Ge0vY": {},
            "DuckDuckGoSearch-4UojL": {}
        };

        // Run the flow
        const response = await langflowClient.runFlow(
            flowIdOrName,
            langflowId,
            prompt, // inputValue is the prompt
            inputType,
            outputType,
            tweaks,
            stream,
            (data) => console.log("Received:", data.chunk), // onUpdate
            (message) => console.log("Stream Closed:", message), // onClose
            (error) => console.log("Stream Error:", error) // onError
        );

        // Handle non-stream response
        if (!stream && response && response.outputs) {
            const flowOutputs = response.outputs[0];
            const firstComponentOutputs = flowOutputs.outputs[0];
            const output = firstComponentOutputs.outputs.message;

            res.json({ message: output.message.text });
        }

    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ error: 'Error generating response' });
    }
});

// Start the Express server on port 3000
app.listen(port, () => {
    console.log(`API server running on http://localhost:${port}`);
});