const axios = require('axios');

const options = {
  method: 'GET',
  url: 'https://streaming-availability.p.rapidapi.com/get',
  params: {
    output_language: 'en',
    tmdb_id: 'movie/603'
  },
  headers: {
    'X-RapidAPI-Key': '27c081bb14msh45367a4447b605dp152897jsn675076a6bd54',
    'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com'
  }
};

axios.request(options).then(function (response) {
    console.log(response.data);
}).catch(function (error) {
    console.error(error);
})
