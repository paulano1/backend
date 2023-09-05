const axios = require('axios');
const env = require('../env.json');

function searchMovies(query) {
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;

    const options = {
        headers: {
            accept: 'application/json',
            Authorization: `Bearer ${env.API_KEY}`
        }
    };

    return axios.get(url, options)
        .then(response => {
            const results = response.data.results;
            const modifiedResults = results.slice(0, 10).map(movie => {
                return {
                    backdrop_path: movie.backdrop_path,
                    id: movie.id,
                    title: movie.title,
                    release_date: movie.release_date
                };
            });

            return modifiedResults;
        })
        .catch(err => {
            console.error('error:', err);
            throw err;
        });
}

module.exports = searchMovies;
