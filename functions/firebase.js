const admin = require('firebase-admin');

const serviceAccount = require('../serviceKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const addComment = async (movieId, comment) => {
    const newComment = {
    author: comment.author,
    body: comment.body,
    postedAt: comment.postedAt,
    replies: [],
    uuid: admin.firestore().collection('random').doc().id // Generate a random ID
    };
  
    const movieRef = db.collection('movies').doc(movieId);
    await movieRef.set({
        comments: admin.firestore.FieldValue.arrayUnion(newComment)
      }, { merge: true });
  };

const addFavourite = async (favourite) => {
    try {
      const newFavourite = {
        image: favourite.image,
        title: favourite.title,
        category: favourite.category,
        mediaType: favourite.mediaType,
        id : favourite.id,
      };
      const uuid = favourite.uuid;
      const favouriteRef = db.collection('favourites').doc(uuid);
  
      await favouriteRef.set({
        favourites: admin.firestore.FieldValue.arrayUnion(newFavourite)
      }, { merge: true });
    } catch (error) {
      console.error("Error adding favourite: ", error);
    }
  };
  
  
  const getFavourites = async (uuid) => {
    try {
      const favouriteRef = db.collection('favourites').doc(uuid);
      const snapshot = await favouriteRef.get();
      if (snapshot.exists) {
        return snapshot.data().favourites;
      } else {
        return null; // or empty array, depending on how you want to handle it
      }
    } catch (error) {
      console.error("Error getting favourites: ", error);
    }
  };
  


  const addReply = async (movieId, commentUuid, reply) => {
    // Define the reply structure
    const newReply = {
        author: reply.author,
        body: reply.body,
        postedAt: reply.postedAt,
    };
  
    const movieRef = db.collection('movies').doc(movieId);
    const movieSnapshot = await movieRef.get();

    if (!movieSnapshot.exists) {
        console.error('Movie not found');
        return;
    }

    const movieData = movieSnapshot.data();
    if (!movieData || !movieData.comments) {
        console.error('No comments found on movie');
        return;
    }

    // Find the comment using the UUID and append the reply
    const updatedComments = movieData.comments.map((comment) => {
        if (comment.uuid === commentUuid) {
            return {
                ...comment,
                replies: [...(comment.replies || []), newReply]
            };
        }
        return comment;
    });

    // Update the movie with the appended reply
    await movieRef.update({
        comments: updatedComments
    });
};


const getCommentsForMovie = async (movieId) => {
    const movieRef = db.collection('movies').doc(movieId);
    const napshot = await movieRef.get();
    return napshot.data().comments;
  };
  const updateAverageRating = async (movieId) => {
    try {
      const ratingsRef = db.collection('movies-ratings').doc(movieId).collection('ratings');
      const snapshot = await ratingsRef.get();
      
      let totalScore = 0;
      let count = 0;
  
      snapshot.forEach(doc => {
        totalScore += doc.data().score;
        count++;
      });
  
      const average = totalScore / count;
  
      const movieRef = db.collection('movies-ratings').doc(movieId);
      await movieRef.update({
        averageRating: average,
        ratingCount: count,
      });
  
    } catch (error) {
      console.error("Error updating average rating:", error);
    }
  };
  
  const addRating = async (uuid, mediatype, tmdb_id, score) => {
    try {
      // Validate score (should be between 1 and 10)
      if (score < 1 || score > 10) {
        return "Invalid score";
      }
  
      const movieId = `${mediatype}_${tmdb_id}`;
      const ratingRef = db.collection('movies-ratings').doc(movieId).collection('ratings').doc(uuid);
      
      await ratingRef.set({
        score: score,
      });
  
      // Optionally: Update average rating (could also be done with a cloud function)
      updateAverageRating(movieId);
  
    } catch (error) {
      console.error("Error adding rating:", error);
      // Handle the error appropriately
    }
  };
  

  const getUserRating = async (uuid, mediatype, tmdb_id) => {
    try {
      const movieId = `${mediatype}_${tmdb_id}`;
      const ratingRef = db.collection('movies-ratings').doc(movieId).collection('ratings').doc(uuid);
      const snapshot = await ratingRef.get();
  
      if (snapshot.exists) {
        return snapshot.data().score;
      } else {
        return null;
      }
  
    } catch (error) {
      console.error("Error fetching user rating:", error);
      // Handle the error appropriately
    }
  };
  

module.exports = {
    addComment,
    addReply,
    getCommentsForMovie,
    addFavourite,
    getFavourites,
    addRating,
    getUserRating,
    updateAverageRating
}
// Path: functions\index.js