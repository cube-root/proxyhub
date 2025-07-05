import express, { response } from "express";
import "dotenv/config";
import http from 'http';
import cors from 'cors';
import { Server } from "socket.io";

const app = express();
const httpServer = http.createServer(app);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());


app.get('/', (req, res) => {
    res.send('Hello World');
});

const PORT = process.env.PORT || 4000;
httpServer.listen(4000, () => {
    console.log(`Server is running on port ${PORT}`);
});