const express = require("express");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");
const GridFsStorage = require("multer-gridfs-storage");
const Grid = require("gridfs-stream");
const methodOverride = require("method-override");

const app = express();
const MONGO_URI = "mongodb://localhost:27017/file-upload";

// Middleware
app.use(express.json());
app.use(methodOverride("_method"));

const conn = mongoose.createConnection(MONGO_URI, {
    useNewUrlParser: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
    useCreateIndex: true,
});

/* Easily stream files to and from MongoDB GridFS i.e getting data to and from mongodb*/
let gfs;
conn.once("open", () => {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection("uploads"); /* name of our collection in db */
    return gfs;
});

// GridFS storage engine for Multer to store uploaded files directly to MongoDb.
const storage = new GridFsStorage({
    url: MONGO_URI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            crypto.randomBytes(16, (err, buf) => {
                /* crypto to gen random file name */
                if (err) {
                    return reject(err);
                }
                const filename =
                    buf.toString("hex") + path.extname(file.originalname);
                const fileInfo = {
                    filename: filename,
                    bucketName: "uploads" /* should match collection name */,
                };
                resolve(fileInfo);
            });
        });
    },
});

app.set("view engine", "ejs");

app.get("/", async (req, res) => {
    try {
        const files = await gfs.files.find().toArray();
        if(!files || files.length===0){
            res.render("index", { files: null });
        }else{
            files.forEach(file=>{
                if (file.contentType === 'image/jpeg' || file.contentType === 'image/png'){
                    file.isImage= true;
                }else file.isImage = false;
            });
            res.render('index',{files});
        }
    } catch (error) {
        return res.status(404).json({ error: error.message });   
    }
});

const upload = multer({ storage });

/* upload middleware used to send 'file' which has to be same as input name in form and stores file info in req.file */
app.post("/upload", upload.single("file"), (req, res) => {
    /* res.json({ file: req.file }); */

    res.redirect("/");
});

app.get("/files", async (req, res) => {
    try {
        const files = await gfs.files.find().toArray();
        if (!files || files.length === 0)
            return res.status(404).json({ error: "No files found" });
        return res.json(files);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get("/files/:fileName", async (req, res) => {
    try {
        const file = await gfs.files.findOne({ filename: req.params.fileName });
        if (!file)
            return res.status(404).json({ error: `${req.params.fileName} does not exist` });
        return res.json(file);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Display image in file
app.get("/image/:fileName", async (req, res) => {
    try {
        const file = await gfs.files.findOne({ filename: req.params.fileName });
        if (!file)
            return res.status(404).json({ error: `${req.params.fileName} does not exist` });
        
        // Check if image
        if (file.contentType === 'image/jpeg' || file.contentType === 'image/png') {
            const readstream = gfs.createReadStream(file.filename); // Read output to browser
            readstream.pipe(res);
        } else {
            res.status(404).json({err: 'Not an image'});
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// delete a file
app.delete("/files/:id", async(req,res)=>{
    try {
        await gfs.remove({_id:req.params.id, root:'uploads'}); //remove from uploads collection
        res.redirect("/");
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
})

app.listen(5000, () => console.log("Server started at port: 5000"));
