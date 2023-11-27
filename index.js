const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors')
const port = process.env.PORT || 5000;


//parser-middleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const uri = "mongodb+srv://<username>:<password>@cluster0.yfrjdbj.mongodb.net/?retryWrites=true&w=majority";
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yfrjdbj.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const productsCollection = client.db('gadgetQuestDB').collection('productsCollection');
        const usersCollection = client.db('gadgetQuestDB').collection('users');
        const userPostCollection = client.db('gadgetQuestDB').collection('userPost');
        const featuredCollection = client.db('gadgetQuestDB').collection('featuredProducts');
        const trendingCollection = client.db('gadgetQuestDB').collection('trendingProducts');

        app.get('/products', async (req, res) => {
            const pageNumber = parseFloat(req.query.currentPage);
            const itemsPerPage = parseFloat(req.query.itemsPerPage)
            const state = req.query.status

            // console.log('the status of product:',state)
            const query = {status: state}
            // const result = await productsCollection.find(query).toArray()
            // console.log(result.length,result)

            const skip = itemsPerPage * pageNumber;
            const limit = itemsPerPage;
            const cursor = await productsCollection.find(query).skip(skip).limit(limit).toArray();
           
            res.send(cursor)
        });



        // total products count
        app.get('/products-count', async (req, res) => {
            const query = {status: 'approved'}
            const findProducts = await productsCollection.find(query).toArray();
            // console.log('the total products:', totalProduct);
            const totalProduct = findProducts.length
            res.send({ totalProduct })
        })

        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result)
        })

        app.patch('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const product = await productsCollection.findOne(query);
            const filter = { _id: new ObjectId(id) };
            const review = req.body;
            const addReview = product.reviews
            addReview.push(review)
            const updateDoc = {
                $set: {
                    reviews: addReview,
                    
                }
            }
            const result = await productsCollection.updateOne(filter, updateDoc)
            res.send(result)


        });


        // moderator api 
        app.patch('/products-approved/:id', async (req, res) => {
            const id = req.params.id;
            const state = req.query.status ;
            console.log('the id for approved products:',id ,'and',state)
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: state,
                    
                }
            }
            const result = await productsCollection.updateOne(filter, updateDoc)
            console.log(result)
            res.send(result)


        });

        // deletion the rejects products

        app.delete('/products-rejected/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.deleteOne(query)
            console.log(result)
            res.send({result})
        });









        app.patch('/products/vote/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const product = await productsCollection.findOne(query);
            const vote = req.body.vote;
            // console.log('id:', product.upvote + vote)
            const addVote = product.upvote + vote
            // console.log(vote, 12345)

            if (vote === 1) {
                const updateDoc = {
                    $set: {
                        upvote: addVote
                    }
                }
                const result = await productsCollection.updateOne(query, updateDoc);
                res.send(result);
            }


            if (vote === -1) {
                const updateDoc = {
                    $set: {
                        downvote: product.downvote + 1
                    }
                }
                const result = await productsCollection.updateOne(query, updateDoc);
                res.send(result);
            }
        })







        app.post('/users', async (req, res) => {
            const doc = req.body;
            const result = await usersCollection.insertOne(doc);
            res.send(result)
        })


        app.post('/users-role/:id', async (req, res) => {
            const id = req?.params?.id;
            const userRole = req?.body?.role
            const query = { _id: new ObjectId(id) };
            const user = await usersCollection.findOne(query);
            const updateDoc = {
                $set: {
                    role: userRole
                }
            }
            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result);
        })


        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)

        })

        app.get('/singleUser/:email', async (req, res) => {
            const email = req.params.email;
            // console.log(email);
            const query = { email: req.params.email }
            const result = await usersCollection.findOne(query)
            // console.log(result);
            res.send(result)

        })

        // user post for product api


        app.post('/users-post/product', async (req, res) => {
            try {
                const product = req.body;
                console.log('user post:', product)
                const result = await productsCollection.insertOne(product);
                res.send(result)
            }
            catch (err) {
                console.log(err)
            }
        })

        // featured products

        app.get('/featured-products', async (req, res) => {
            const result = await featuredCollection.find().toArray();
            res.send(result)
        })
        
        // trending products
        
        app.get('/trending-products', async (req, res) => {
            const result = await trendingCollection.find().toArray();
            res.send(result)
        })


        // moderator api 
        app.get('/user-post-products',async(req, res)=>{
            
            const result = await productsCollection.find().toArray();
            res.send(result)
        })





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);









app.get('/', (req, res) => {
    res.send('gadgetQuest server is running')
});


app.listen(port, () => {
    console.log(`gadgetQuest server is running on the port ${port}`)
})