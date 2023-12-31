const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors')
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const stripe = require('stripe').Stripe(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


//parser-middleware
app.use(cors({ origin: ['https://gadget-quest.web.app'] }));
app.use(express.json());

// verify token ;
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized' })
    }

    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.TOKEN_SECRET, (error, decoded) => {
        if (error) {
            return res.status(403).send({ message: 'Forbidden' })
        }
        req.decoded = decoded;
        next();
    })
}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// const uri = "mongodb+srv://<username>:<password>@cluster0.yfrjdbj.mongodb.net/?retryWrites=true&w=majority";
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yfrjdbj.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);


mongoose.connect(uri)
.then(()=>console.log('mongoose database is successfully connected'))
.catch((error)=>console.log(`mongoose got an server side error:${error}`))



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
        // await client.connect();

        const productsCollection = client.db('gadgetQuestDB').collection('productsCollection');
        const usersCollection = client.db('gadgetQuestDB').collection('users');
        const userPostCollection = client.db('gadgetQuestDB').collection('userPost');
        const featuredCollection = client.db('gadgetQuestDB').collection('featuredProducts');
        const trendingCollection = client.db('gadgetQuestDB').collection('trendingProducts');
        const couponCollection = client.db('gadgetQuestDB').collection('coupon');

        // jwt token creating 
        app.post('/jwt', async (req, res) => {
            const user = req.body;

            const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })

        })




        app.get('/products', async (req, res) => {
            const pageNumber = parseFloat(req.query.currentPage);
            const itemsPerPage = parseFloat(req.query.itemsPerPage)
            const state = req.query.status
            const searchText = req.query.search;
            let query = { status: state }
            const totalProduct = (await productsCollection.find(query).toArray()).length;



            let totalCount = totalProduct;
            if (searchText) {
                query = {
                    status: state,
                    tags: searchText,
                }
                const total = (await productsCollection.find(query).toArray()).length
                totalCount = total

            }


            const skip = itemsPerPage * pageNumber;
            const limit = itemsPerPage;
            const cursor = await productsCollection.find(query).skip(skip).limit(limit).toArray();

            res.send({ cursor, totalCount })
        });


        // creating the payment intent ;
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ["card"],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });


        })



        // total products count / maybe this api is not used.have to check later ;
        app.get('/products-count', async (req, res) => {
            const query = { status: 'approved' }
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

        // my products api 

        app.get('/myProducts/:email', verifyToken, async (req, res) => {
            const userEmail = req.params.email;
            const query = { uploader: userEmail }
            const result = await productsCollection.find(query).toArray();
            // console.log('myProducts result:', result);
            res.send(result)
        })




        app.patch('/products/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const product = await productsCollection.findOne(query);
            const filter = { _id: new ObjectId(id) };
            const review = req.body;
            const addReviewer = product.reviewer;
            addReviewer.push(review.email)
        
            const addReview = product.reviews
            addReview.push(review)
            const updateDoc = {
                $set: {
                    reviews: addReview,
                    reviewer: addReviewer

                }
            }
            const result = await productsCollection.updateOne(filter, updateDoc)
            res.send(result)


        });


        // admin api ;

        app.post('/add-coupon', verifyToken, async (req, res) => {
            const coupon = req.body;
            // console.log('the coupon:', coupon);
            const result = await couponCollection.insertOne(coupon)
            res.send(result)
        })








        // all products from the productCollection ;

        app.patch('/products/vote/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const product = await productsCollection.findOne(query);
            const vote = req.body.vote;
            const user = req.body.userInfo;
            const addVote = product.upvote + vote;
            const addVoter = product.voter;
            
            addVoter.push(user)

            if (vote === 1) {
                const updateDoc = {
                    $set: {
                        upvote: addVote,
                        voter: addVoter
                    }
                }
                const result = await productsCollection.updateOne(query, updateDoc);
                res.send(result);
            }


            if (vote === -1) {
                const updateDoc = {
                    $set: {
                        downvote: product.downvote + 1,
                        voter: addVoter
                    }
                }
                const result = await productsCollection.updateOne(query, updateDoc);
                res.send(result);
               
            }
        })


        // vote for featured products;

        app.patch('/featured-products/vote/:id', async (req, res) => {
            const id = req.params.id;
            const vote = parseFloat(req.body.vote);
            const user = req.body.userInfo;
            const query = { _id: new ObjectId(id) };
            const product = await featuredCollection.findOne(query);
            const addVoter = product.voter;
            addVoter.push(user)
         
            const addVote = product.upvote + vote
            if (vote === 1) {
                const updateDoc = {
                    $set: {
                        upvote: addVote,
                        voter: addVoter
                    }
                }
                const result = await featuredCollection.updateOne(query, updateDoc);
                res.send(result);
            }
            if (vote === -1) {
              
                const updateDoc = {
                    $set: {
                        downvote: product.downvote + 1,
                        voter: addVoter
                    }
                }
                const result = await featuredCollection.updateOne(query, updateDoc);
                res.send(result);
            }
        });


        // vote for the trending products ;

        app.patch('/trending-products/vote/:id', async (req, res) => {
            const id = req.params.id;
            const vote = parseFloat(req.body.vote);
            const user = req.body.userInfo;
            const query = { _id: new ObjectId(id) };
            const product = await trendingCollection.findOne(query);
            const addVoter = product.voter;
            addVoter.push(user)
            const addVote = product.upvote + vote
            if (vote === 1) {
                const updateDoc = {
                    $set: {
                        upvote: addVote,
                        voter: addVoter
                    }
                }
                const result = await trendingCollection.updateOne(query, updateDoc);
                res.send(result);
            }

            if (vote === -1) {
                const updateDoc = {
                    $set: {
                        downvote: product.downvote + 1,
                        voter: addVoter
                    }
                }
                const result = await trendingCollection.updateOne(query, updateDoc);
                res.send(result);
            }
        });













        // report a products ;

        app.patch('/products/report/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const reporterInfo = req.body;
            const query = { _id: new ObjectId(id) };
            const product = await productsCollection.findOne(query);
            const reportInfo = product.reportedUser
            reportInfo.push(reporterInfo)
            const updateDoc = {
                $set: {
                    reported: true,
                    reportedUser: reportInfo
                }
            }

            const result = await productsCollection.updateOne(query, updateDoc);
            res.send(result);


        });

        //total user count & total products count;
        app.get('/user-products-count',async(req, res)=>{
            const totalUsers = await usersCollection.estimatedDocumentCount();
            const totalproducts = await productsCollection.estimatedDocumentCount();
            const totalFeatured = await featuredCollection.estimatedDocumentCount();
            const totalTrending = await trendingCollection.estimatedDocumentCount();
            res.send({totalUsers,totalproducts,totalFeatured,totalTrending})
        })





        //if user is payment done ;
        app.patch('/update-user-paymentInfo/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            const transaction = req.body.transaction;
            console.log(req.body, 'and email', email);
            const filter = { email: email }
            const post = req?.body?.post;

            if (post) {

                console.log(post, 1000)
                const user = await usersCollection.findOne(filter);
                console.log(222222,user)
                const addPostinfo = user?.postInfo
                console.log(addPostinfo,11111)
                addPostinfo.push(post)
                const updateDoc = {
                    $set: {
                        postInfo: addPostinfo
                    }
                };
                const result = await usersCollection.updateOne(filter, updateDoc);
                console.log(result);
                res.send(result);
                console.log(result)
                return ;
            }
            const updateDoc = {
                $set: {
                    status: 'verified',
                    transacId: transaction,
                }
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            console.log(result);
            res.send(result)
        })





        // user saving in db

        app.post('/users', async (req, res) => {
            const doc = req.body;
            // console.log('the doc:',doc)
            const query = { email: doc.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'already exist' })
            }
            else {
                const result = await usersCollection.insertOne(doc);
                res.send(result)
            }



        })

        // admin api ;
        app.patch('/users-role/:id', verifyToken, async (req, res) => {
            const id = req?.params?.id;
            const userRole = req?.body?.role;
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


        app.get('/users', verifyToken, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)

        })

        app.get('/singleUser/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            // console.log(email);
            const query = { email: req.params.email }
            const result = await usersCollection.findOne(query)
            // console.log(result);
            res.send(result)

        })

        // user post for product api


        app.post('/users-post/product', verifyToken, async (req, res) => {
            try {
                const product = req.body;
                const result = await productsCollection.insertOne(product);
                res.send(result)
            }
            catch (err) {
                console.log(err)
            }
        });

        // update user posting product ;

        app.patch('/users-post/product/:id', async (req, res) => {
            try {
                const product = req.body;
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) }
                const updateDoc = {
                    $set: {
                        title: product.title,
                        name: product.name,
                        img: product.img,
                        tags: product.tags,
                        description: product.description,
                        date: product.date,
                        number: product.number
                    }
                }
                const result = await productsCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            catch (err) {
                console.log(err)
            }
        });








        // featured products

        app.get('/featured-products', async (req, res) => {
            const sortField = req.query.sortField;
            const sortOrder = parseFloat(req.query.sortOrder)
            let sortObj = {};
            if (sortField && sortOrder) {
                sortObj[sortField] = sortOrder;
            }

            const result = await featuredCollection.find().sort(sortObj).toArray();
            res.send(result)
        })

        // trending products

        app.get('/trending-products', async (req, res) => {
            const result = await trendingCollection.find().toArray();
            res.send(result)
        })


        // moderator api 
        app.get('/user-post-products', verifyToken, async (req, res) => {

            const result = await productsCollection.find().toArray();
            res.send(result)
        })

        // moderator : add to the featured api

        app.post('/add-feature', verifyToken, async (req, res) => {
            const product = req.body;
        
            if (product._id) {
                const id = product._id;
                delete product._id
                product.id = id ;
            }

            const result = await featuredCollection.insertOne(product);
            res.send(result)
        })

        // moderator api 
        app.patch('/products-approved/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const state = req.query.status;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: state,

                }
            }
            const result = await productsCollection.updateOne(filter, updateDoc)
            // console.log(result)
            res.send(result)


        });

        // moderator api  deletion the rejects products

        app.delete('/products-rejected/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.deleteOne(query)
            // console.log(result)
            res.send({ result })
        });

        // medorator api : load all reported product ;

        app.get('/load-reported-products', verifyToken, async (req, res) => {
            const query = {
                reported: true
            }

            const result = await productsCollection.find(query).toArray();
            res.send(result)
        })

        // deleted all reported products

        app.delete('/delete-reported-product/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsCollection.deleteOne(query);
            res.send(result)
        })







        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
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