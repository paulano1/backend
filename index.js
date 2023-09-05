// index.js
const express = require("express");
const axios = require("axios");
const cors = require('cors');
const { addComment, getCommentsForMovie, addReply, getFavourites, addFavourite, addRating, getUserRating, updateAverageRating } = require('./functions/firebase');

const app = express();
const PORT = 4000;

// let apiFile = require("./env.json");
// let rapidApiKey = apiFile["rapid_api_key"];
// let rapidBaseUrl = apiFile["rapid_api_url"];
// let tmdbApiToken = apiFile["tmdb_api_token"];
// let tmdbBaseUrl = apiFile["tmdb_api_url"];

app.use(cors());
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Hey this is my API running 🥳')
});

app.post('/rating', async (req, res) => {
  const { uuid, mediatype, tmdb_id, score } = req.body;
  try {
    await addRating(uuid, mediatype, tmdb_id, score);
    res.status(200).send("Rating added successfully.");
  } catch (error) {
    res.status(500).send(`Error: ${error}`);
  }
});

// Get user rating
app.get('/rating/:uuid/:mediatype/:tmdb_id', async (req, res) => {
  const { uuid, mediatype, tmdb_id } = req.params;
  try {
    const score = await getUserRating(uuid, mediatype, tmdb_id);
    res.status(200).json({ score });
  } catch (error) {
    res.status(500).send(`Error: ${error}`);
  }
});



app.get('/favourites', async (req, res) => {
  try {
    const uuid = req.query.uuid;
    const favourites = await getFavourites(uuid);
    console.log("in favorites handler");
    if (favourites) {
      res.json(favourites)
    } else {
      res.json({})
    }
  } catch (error) {
    console.log(error);
    res.status(500).send('Failed to fetch favourites');
  }
});

app.post('/favourites', async (req, res) => {
  try {
    console.log(req.body)
    await addFavourite(req.body);
    res.status(201).send('Favourite added successfully');
  } catch (error) {
    console.log(error);
    res.status(500).send('Failed to add favourite');
  }
});


app.post('/movies/:movieId/comments', async (req, res) => {
  try {
    await addComment(req.params.movieId, req.body);
    res.status(201).send('Comment added successfully');
  } catch (error) {
    console.log(error);
    res.status(500).send('Failed to add comment');
  }
});

app.post('/movies/:movieId/comments/:commentUuid/replies', async (req, res) => {
  try {
    await addReply(req.params.movieId, req.params.commentUuid, req.body);
    res.status(201).send('Reply added successfully');
  } catch (error) {
    res.status(500).send('Failed to add reply');
  }
});

app.get('/movies/:movieId/comments', async (req, res) => {
  try {
    const comments = await getCommentsForMovie(req.params.movieId);
    res.json(comments);
  } catch (error) {
    console.log(error);
    res.status(500).send('Failed to fetch comments');
  }
});


app.post('/rating', (req, res) => {
  const movieId = req.body.movieId;
  const rating = req.body.rating;
  if (!movieId || !rating) {
    return res.status(400).send("Please provide a movieId and rating.");
  }
  updateMovieRating(movieId, rating)
    .then(() => {
      res.status(201).send("Rating added successfully.");
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send("Something went wrong.");
    });
});

app.get("/rating", (req, res) => {
  const movieId = req.query.movieId;
  if (!movieId) {
    return res.status(400).send("Please provide a movieId.");
  }
  getRating(movieId)
    .then((rating) => {
      res.json(rating);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send("Something went wrong.");
    });
});

app.get("/services", (req, res) => {
  let services = {};
  axios(`${rapidBaseUrl}/services?rapidapi-key=${rapidApiKey}`)
    .then((response) => {
      let results = response.data.result;

      for (const [service, details] of Object.entries(results)) {
        let isAvailableInUs =
          details.countries["us"] !== undefined ? true : false;
        if (isAvailableInUs) {
          services[service] = { id: details.id };
        }
      }

      // TO-DO the key values should be added as the data value for frontend elements
      // this should not be hard coded since it can be changed and we may need to pass it on click events

      return res.json(services);
    })
    .catch((error) => {
      console.log(error);
      return res.status(400).json({
        error: "Something went wrong, cannot retrieve services at this time",
      });
    });
});

// Services parameter is required for this request (comma delimited list).
// Optional parameters in query string - keyword, output_language, order_by (original_title or year), desc (true or false), genres (ids of the genre), genres_relation
// Filter by series or movie by show_type query value, default if not provided is both.
app.get("/moviesByServices/:services", (req, res) => {
  let query = req.query;
  let params = req.params;

  if (!params || !params.services) {
    console.log(
      "Error: request should have a query called services that is a comma delimited list of services."
    );
    return res.status(400).json({
      error:
        "Something went wrong, can not show these movies at this time. Try again at a later time.",
    });
  }

  axios(`${rapidBaseUrl}/search/filters?rapidapi-key=${rapidApiKey}`, {
    Content_Type: "application/json",
    params: {
      services: params.services,
      country: "us",
      keyword: query.keyword,
      output_language: "en",
      order_by: query.order_by,
      genres: query.genres,
      genres_relation: query.genres_relation,
      show_original_language: "en",
      desc: query.desc,
      show_type: query.show_type,
    },
  })
    .then((response) => {
      let result = response.data.result;

      return res.status(200).json(result);
    })
    .catch((error) => {
      console.log(error);
      return res.status(400).json({
        error: "Something went wrong, cannot retrieve movies at this time",
      });
    });
});

app.get("/genres", (req, res) => {
  axios(`${rapidBaseUrl}/genres&rapidapi-key=${rapidApiKey}`)
    .then((response) => {
      let result = response.data.result;
      // TO-DO the key values should be added as the data value for frontend elements
      // this should not be hard coded since genres can be added in the future I believe
      return res.status(200).json(result);
    })
    .catch((error) => {
      console.log(error);
      return res.status(400).json({
        error: "Something went wrong, cannot retrieve genres at this time",
      });
    });
});

app.get("/moviesByGenres", (req, res) => {
  if (!isValidGenresRequest(req)) {
    console.log(
      "Request requires genres in the query and should be a comma delimited list of their associated key numbers."
    );
    return res.status(400).json({
      error:
        "This is not a valid genre request. Please try again at a later time.",
    });
  }

  axios(
    `${rapidBaseUrl}/search/filters?genres=${req.query.genres}&country=us&rapidapi-key=${rapidApiKey}`
  )
    .then((response) => {
      let result = response.data.result;

      return res.status(200).json(result);
    })
    .catch((error) => {
      console.log(error);
      return res.status(400).json({
        error: `Something went wrong, cannot retrieve movies at this time for genre key numbers ${req.query.genres}.`,
      });
    });
});

function isValidGenresRequest(req) {
  if (!req.query || !req.query.genres || genres === "") {
    return false;
  }

  let list = req.query.genres.split(",");

  list.forEach((genre) => {
    let genreKeys = Object.keys(genresId);
    let selectedKey;

    try {
      selectedKey = Integer.parseInt(genre);
    } catch (e) {
      return false;
    }

    if (!genreKeys.contains(selectedKey)) {
      return false;
    }
  });

  return true;
}

app.listen(PORT, () => {
  console.log(`API listening on PORT ${PORT} `);
});
// Export the Express API
module.exports = app;
