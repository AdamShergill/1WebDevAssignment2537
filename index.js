
require("./utils.js");

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");


const expireTime = 60 * 60 * 1000; //expires after 1 hour  (hours * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

var {database} = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');

app.use(express.urlencoded({extended: false}));

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
	crypto: {
		secret: mongodb_session_secret
	}
})

app.use(session({ 
    secret: node_session_secret,
	store: mongoStore, //default is memory store 
	saveUninitialized: false, 
	resave: true
}
));

app.get('/', (req,res) => {
    var missingEmail = req.query.missing;
    var htmlHomePage = `
    <a href="/signup"><button>Sign Up</button></a>
    <br>
    <a href="/login"><button>Log In</button></a>
    `;
    if (missingEmail) {
        htmlHomePage += "<br> email is required";
    }
    res.send(htmlHomePage);
});


app.get('/signup', (req, res) => {
    var missingEmail = req.query.missing;
    var htmlSignUp = `
        create user
        <form action='/signupsubmit' method='post'>
            <input name='name' type='text' placeholder='name'>
            <br>
            <input name='email' type='text' placeholder='email'>
            <br>
            <input name='password' type='text' placeholder='password'>
            <br>
            <button>Submit</button>
        </form>
        
    `;
    res.send(htmlSignUp);
});

app.post('/signupsubmit', async (req, res) => {
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;

    if (!name || !email || !password) {
        const errorMessage = 'Please fill all fields.';
        const html = `
        <p>${errorMessage}</p>
        <a href="/signup?missing=true">Return to signup page</a>
      `;
        res.send(html);
        return;
    }

    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
        const errorMessage = 'An account using this email address already exists.';
        const html = `
        <p>${errorMessage}</p>
        <a href="/signup">Return to signup page</a>
      `;
        res.send(html);
        return;
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = { name, email, password: hashedPassword };
        const result = await userCollection.insertOne(newUser);
        console.log(`Created new user: ${result.insertedId}`);

        req.session.name = name;
        req.session.email = email;


        res.redirect('/members');

    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/nosql-injection', async (req,res) => {
	var username = req.query.user;

	if (!username) {
		res.send(`<h3>no user provided - try /nosql-injection?user=name</h3> <h3>or /nosql-injection?user[$ne]=name</h3>`);
		return;
	}
	console.log("user: "+username);

	const schema = Joi.string().max(20).required();
	const validationResult = schema.validate(username);

	//If we didn't use Joi to validate and check for a valid URL parameter below
	// we could run our userCollection.find and it would be possible to attack.
	// A URL parameter of user[$ne]=name would get executed as a MongoDB command
	// and may result in revealing information about all users or a successful
	// login without knowing the correct password.
	if (validationResult.error != null) {  
	   console.log(validationResult.error);
	   res.send("<h1 style='color:darkred;'>A NoSQL injection attack was detected!!</h1>");
	   return;
	}	

	const result = await userCollection.find({username: username}).project({username: 1, password: 1, _id: 1}).toArray();

	console.log(result);

    res.send(`<h1>Hello ${username}</h1>`);
});

app.get('/about', (req,res) => {
    var color = req.query.color;

    res.send("<h1 style='color:"+color+";'>Patrick Guichon</h1>");
});

app.get('/contact', (req,res) => {
    var missingEmail = req.query.missing;
    var html = `
        email address:
        <form action='/submitEmail' method='post'>
            <input name='email' type='text' placeholder='email'>
            <button>Submit</button>
        </form>
    `;
    if (missingEmail) {
        html += "<br> email is required";
    }
    res.send(html);
});

app.post('/submitEmail', (req,res) => {
    var email = req.body.email;
    if (!email) {
        res.redirect('/contact?missing=1');
    }
    else {
        res.send("Thanks for subscribing with your email: "+email);
    }
});


app.get('/createUser', (req,res) => {
    var html = `
    create user
    <form action='/submitUser' method='post'>
    <input name='username' type='text' placeholder='username'>
    <input name='password' type='password' placeholder='password'>
    <button>Submit</button>
    </form>
    `;
    res.send(html);
});


app.get('/login', (req, res) => {
    var missingCredentials = req.query.missing;
    var loginFailed = req.query.failed;
    var html = `
        log in
        <form action='/loginsubmit' method='post'>
            <input name='email' type='text' placeholder='email'>
            <br>
            <input name='password' type='password' placeholder='password'>
            <br>
            <button>Log In</button>
        </form>
    `;
    if (missingCredentials) {
        html += "<br> Email and password are required";
    }
    if (loginFailed) {
        html += "<br> Login failed";
    }
    res.send(html);
});



app.post('/submitUser', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;

	const schema = Joi.object(
		{
			username: Joi.string().alphanum().max(20).required(),
			password: Joi.string().max(20).required()
		});
	
	const validationResult = schema.validate({username, password});
	if (validationResult.error != null) {
	   console.log(validationResult.error);
	   res.redirect("/createUser");
	   return;
   }

    var hashedPassword = await bcrypt.hash(password, saltRounds);
	
	await userCollection.insertOne({username: username, password: hashedPassword});
	console.log("Inserted user");

    var html = "successfully created user";
    res.send(html);
});

app.post('/loggingin', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;

	const schema = Joi.string().max(20).required();
	const validationResult = schema.validate(username);
	if (validationResult.error != null) {
	   console.log(validationResult.error);
	   res.redirect("/login");
	   return;
	}

	const result = await userCollection.find({username: username}).project({username: 1, password: 1, _id: 1}).toArray();

	console.log(result);
	if (result.length != 1) {
		console.log("user not found");
		res.redirect("/login");
		return;
	}
	if (await bcrypt.compare(password, result[0].password)) {
		console.log("correct password");
		req.session.authenticated = true;
		req.session.username = username;
		req.session.cookie.maxAge = expireTime;

		res.redirect('/loggedIn');
		return;
	}
	else {
		console.log("incorrect password");
		res.redirect("/login");
		return;
	}
});

app.post('/loginsubmit', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    if (email && !password) {
        const errorMessage = 'Incorrect password.';
        const html = `
            <p>${errorMessage}</p>
            <a href="/login?missing=true">Try again</a>
        `;
        res.send(html);
        return;
    }
    if (!email || !password) {
        const errorMessage = 'Incorrect email and/or password.';
        const html = `
            <p>${errorMessage}</p>
            <a href="/login?missing=true">Try again</a>
        `;
        res.send(html);
        return;
    }

    const existingUser = await userCollection.findOne({ email });
    if (!existingUser) {
        const errorMessage = 'Incorrect email and/or password.';
        const html = `
            <p>${errorMessage}</p>
            <a href="/login">Try again</a>
        `;
        res.send(html);
        return;
    }

    try {
        const passwordMatches = await bcrypt.compare(password, existingUser.password);
        if (!passwordMatches) {
            const errorMessage = 'Incorrect password.';
            const html = `
                <p>${errorMessage}</p>
                <a href="/login?failed=true">Try again</a>
            `;
            res.send(html);
            return;
        }
        
        req.session.userId = existingUser._id;
        req.session.email = existingUser.email;
        req.session.name = existingUser.name;
        req.session.loggedIn = true;
        req.session.save();
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/members', requireAuth, (req, res) => {
    const { name } = req.session;
    const catIds = ['1', '2', '4'];
    const randomCatId = catIds[Math.floor(Math.random() * catIds.length)];
    const catNames = {
        '1': 'Fluffy',
        '2': 'Socks',
        '4': 'Baby'
    };
    const catName = catNames[randomCatId];
    const catGifs = {
        '1': '/fluffy.gif',
        '2': '/socks.gif',
        '4': '/baby.gif'
    };
    const catGif = catGifs[randomCatId];

    res.send(`
      <h1>Hello ${name}</h1>
      <img src='${catGif}' style='width:250px;'>
      <form action="/logout" method="POST">
        <button type="submit">Sign out</button>
      </form>
    `);
});

app.get('/cat/:id', (req, res) => {
    const catIds = ['1', '2', '4'];
    const catId = req.params.id;

    if (catIds.includes(catId)) {
        const catNames = {
            '1': 'Fluffy',
            '2': 'Socks',
            '4': 'Baby'
        };
        const catName = catNames[catId];
        const catGifs = {
            '1': '/fluffy.gif',
            '2': '/socks.gif',
            '4': '/baby.gif'
        };
        const catGif = catGifs[catId];

        res.send(`${catName}: <img src='${catGif}' style='width:250px;'>`);
    } else {
        res.send(`Invalid cat id: ${catId}`);
    }
});



app.get('/loggedin', (req,res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    var html = `
    You are logged in!
    `;
    res.send(html);
});

app.get('/logout', (req,res) => {
	req.session.destroy();
    var html = `
    You are logged out.
    `;
    res.send(html);
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

function requireAuth(req, res, next) {
    if (!req.session.email) {
        res.redirect('/login');
    } else {
        next();
    }
}




app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
	res.status(404);
	res.send("Page not found - 404");
})

app.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 
