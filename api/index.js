// index.js
const express = require("express");
const axios = require("axios");
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 8000;

// var serviceAccount = {
//   "type": process.env.TYPE,
//   "project_id": process.env.PROJECT_ID,
//   "private_key_id": process.env.PRIVATE_KEY_ID,
//   "private_key": process.env.PRIVATE_KEY.replace(/\\n/g, '\n'), // Replaces \\n with actual newline characters
//   "client_email": process.env.CLIENT_EMAIL,
//   "client_id": process.env.CLIENT_ID,
//   "auth_uri": process.env.AUTH_URI,
//   "token_uri": process.env.TOKEN_URI,
//   "auth_provider_x509_cert_url": process.env.AUTH_PROVIDER_X509_CERT_URL,
//   "client_x509_cert_url": process.env.CLIENT_X509_CERT_URL
// };

app.use(cors());
app.use(express.json())
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://bofa-hack-default-rtdb.firebaseio.com/'
});

app.get('/', (req, res) => {
  res.send('Hey this is my API running 🥳')
});


async function createAccount(dob, email, name, role, balance, db) {
  const userRecord = await admin.auth().createUser({
    email: email,
    password: uuidv4().slice(0, 8),
    displayName: name,
  });

  const batch = db.batch();
  const accountRef = db.collection('accounts').doc(userRecord.uid);
  batch.set(accountRef, {
    dob: dob,
    email: email,
    name: name,
    role: role,
    balance: balance,
  });
  await batch.commit();

  return userRecord.uid;
}

async function validChildTransfer(from, to, transferAmount, fromData, toData, res, transactionId) {
    const db = admin.firestore();
    
    //TODO RULE CHECK
    const parentRef = db.collection('child').doc(from)
    const parentId = await parentRef.get().then((doc) => {
      if (doc.exists) {
        return doc.data().parent;
      } else {
        return null;
      }
    });
    const rules = await db.collection('rules').doc(from).get().then((doc) => {
      if (doc.exists) {
        return doc.data().rules;
      } else {
        return null;
      }
    });
    
    if (rules) {
      for (let i = 0; i < rules.length; i++) {
        let { balance, amount, operator, result } = rules[i];

        switch(balance){
          case 'account_balance':
            balance = fromData.balance;
            break;
          case 'transfer_amount':
            balance = transferAmount;
            break;
          case 'amount_unavailable':
            balance = fromData.balance - transferAmount;
            break;
        }
        switch(operator){
          case '=':
            if(parseInt(balance) == parseInt(amount)){
              console.log('balance = amount', typeof balance, typeof amount)
              switch(result){
                case 'Request_approval':
                  await createNewRequest(parentId, from, transferAmount, fromData, toData, transactionId);
                  return false;
                case 'Transfer_from_parent':
                  const transactionid = await createTransaction(parentId, from, transferAmount, db)
                  await processTransaction(transactionid);
                case 'reject':
                  return false;
              }
            }
            break;
          case '<':
            if(parseInt(balance) < parseInt(amount)){
              console.log('balance < amount', typeof balance, typeof amount)
              switch(result){
                case 'Request_approval':
                  await createNewRequest(parentId, from, transferAmount, fromData, toData, transactionId);
                  return false;
                case 'Transfer_from_parent':
                  const transactionid = await createTransaction(parentId, from, transferAmount, db)
                  await processTransaction(transactionid);
                case 'reject':
                  return false;
              }
            }
            break;
          case '>':
            if(parseInt(balance) > parseInt(amount)){
              console.log('balance > amount', typeof balance, typeof amount)
              switch(result){
                case 'Request_approval':
                  await createNewRequest(parentId, from, transferAmount, fromData, toData, transactionId);
                  return false;
                case 'Transfer_from_parent':
                  const transactionid = await createTransaction(parentId, from, transferAmount, db)
                  await processTransaction(transactionid);
                case 'reject':
                  return false;
              }
            }
            break;
        }          
      }
  }

  return true;
}
async function createNewRequest(parentId, from, amount, fromData, toData, transactionId) {
  const realTimeDb = admin.database().ref('requests/' + parentId);
  const newRequest = realTimeDb.push();
  
  // Wait for the database operation to complete
  await newRequest.set({
    childUuId: from,
    requestDetails: 'Transfer of ' + amount + ' from '+ fromData.name + ' to ' + toData.name,
    transactionId: transactionId,
    status: 'pending'
  });
}

async function createTransaction(from, to, amount, db) {
  const transactionRef = db.collection('transactions').doc();
  const transaction = {
    from: from,
    to: to,
    amount: amount,
    timestamp: new Date(),
    status: 'pending'
  };
  await transactionRef.set(transaction);
  return transactionRef.id;
}


async function processTransaction(transactionId) {
  const db = admin.firestore();
  const transactionRef = db.collection('transactions').doc(transactionId);
  const transactionSnapshot = await transactionRef.get();
  const transactionData = transactionSnapshot.data();
  const fromRef = db.collection('accounts').doc(transactionData.from);
  const toRef = db.collection('accounts').doc(transactionData.to);
  const fromSnapshot = await fromRef.get();
  const toSnapshot = await toRef.get();
  const fromData = fromSnapshot.data();
  const toData = toSnapshot.data();
  const batch = db.batch();
  batch.update(transactionRef, {
      status: 'approved'
  });
  batch.update(fromRef, {
      balance: parseInt(fromData.balance) - parseInt(transactionData.amount)
  });
  batch.update(toRef, {
      balance: parseInt(toData.balance) + parseInt(transactionData.amount)
  });
  await batch.commit();
}

app.post('/addChild', async (req, res) => {
  const { name, email, dob, parentId } = req.body;

  if (!name || !email || !dob || !parentId) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }


  const db = admin.firestore()
  try {
    const childId = await createAccount(dob, email, name, 'child', 0, db);
    const batch = db.batch();
    const childRef = db.collection('child').doc(childId);
    batch.set(childRef, {
      name: name,
      parent: parentId,
    });
    const parentChildMapRef = db.collection('parentChildMapping').doc(parentId);
    const parentChildMapSnapshot = await parentChildMapRef.get();
    if (parentChildMapSnapshot.exists) {
      batch.update(parentChildMapRef, {
        [parentId]: admin.firestore.FieldValue.arrayUnion(childId)
      });
    } else {
      // Or set a new array if this is the first child being added
      batch.set(parentChildMapRef, {
        [parentId]: [childId]
      });
    }

    // Commit the batch
    await batch.commit();

    res.status(200).json({ message: 'Child account created successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
);

app.post('/transfer', async (req, res) => {
  const { from, to, amount } = req.body;

  if (!from || !to || !amount) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }

  const db = admin.firestore()
  const fromRef = db.collection('accounts').doc(from);
  const toRef = db.collection('accounts').doc(to);
  const transactionRef = db.collection('transactions').doc();
  

  const fromSnapshot = await fromRef.get();
  const toSnapshot = await toRef.get();

  if (!fromSnapshot.exists || !toSnapshot.exists) {
    return res.status(404).json({ message: 'Account not found' });
  }

  let transaction = {
    from: from,
    to: to,
    amount: amount,
    timestamp: new Date(),
    status: 'pending'
  };

  const fromData = fromSnapshot.data();
  const toData = toSnapshot.data();

  if (parseInt(fromData.balance) < parseInt(amount)) {
    return res.status(400).json({ message: 'Insufficient balance' });
  }
  const batch = db.batch();
  batch.set(transactionRef, transaction);
  await batch.commit();

  if (fromData.role == 'child') {
    if (await validChildTransfer(from, to, amount, fromData, toData, res, transactionRef.id)) {
      db.collection('transactions').doc(transactionRef.id).update({
        status: 'approved'
      });
    } else {
      return res.status(200).json({ message: 'Request sent to parent for approval' });
    } 
  } else {
    batch.update(transactionRef, {
      status: 'approved'
    });
  }
  
  await processTransaction(transactionRef.id);

  res.status(200).json({ message: 'Transfer successful' });
}
);

app.post('/deposit', async (req, res) => {
  const { accountId, amount } = req.body;

  if (!accountId || !amount) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }

  const db = admin.firestore()
  const accountRef = db.collection('accounts').doc(accountId);

  const accountSnapshot = await accountRef.get();

  if (!accountSnapshot.exists) {
    return res.status(404).json({ message: 'Account not found' });
  }

  const accountData = accountSnapshot.data();
  if (accountData.role == 'child') {
    //TODO
    return res.status(400).json({ message: 'Cannot deposit to child account' });
  }

  const batch = db.batch();
  batch.update(accountRef, {
    balance: parseInt(accountData.balance) + parseInt(amount)
  });

  await batch.commit();

  res.status(200).json({ message: 'Deposit successful' });
}
);

app.get('/getBalance', async (req, res) => {
  const { accountId } = req.query;

  if (!accountId) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }

  const db = admin.firestore()
  const accountRef = db.collection('accounts').doc(accountId);

  const accountSnapshot = await accountRef.get();

  if (!accountSnapshot.exists) {
    return res.status(404).json({ message: 'Account not found' });
  }

  const accountData = accountSnapshot.data();

  res.status(200).json({ balance: accountData.balance });
}
);

app.get('/getParentId/:childId', async (req, res) => {
  const { childId } = req.params;

  if (!childId) {
    return res.status(400).json({ message: 'Please provide all the fields' });
  }

  const db = admin.firestore()
  const childRef = db.collection('child').doc(childId);

  const childSnapshot = await childRef.get();

  if (!childSnapshot.exists) {
    return res.status(404).json({ message: 'Child not found' });
  }

  const childData = childSnapshot.data();

  res.status(200).json({ parentId: childData.parent });
}
);

app.post('/askApproval', async (req, res) => {
  const { childUuId, requestDetails, transactionId, parentId } = req.body;

  // Ensure all required fields are provided
  if (!childUuId || !requestDetails || !parentId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const realTimeDb = admin.database().ref('requests/' + parentId);
    const newRequest = realTimeDb.push();
    
    // Wait for the database operation to complete
    await newRequest.set({
      childUuId: childUuId,
      requestDetails: requestDetails,
      transactionId: transactionId,
      status: 'pending'
    });

    res.status(200).json({ message: 'Request sent successfully' });
  } catch (error) {
    console.error('Error sending request:', error);
    res.status(500).json({ message: 'Failed to send request' });
  }
});

app.get('/getRequests/:parentId', async (req, res) => {
  const { parentId } = req.params;

  // Ensure all required fields are provided
  if (!parentId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const realTimeDb = admin.database().ref('requests/' + parentId);
    
    // Wait for the database operation to complete
    realTimeDb.once('value', (snapshot) => {
      const requests = snapshot.val();

      res.status(200).json({ requests: requests });
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ message: 'Failed to fetch requests' });
  }
});



app.post('/approveRequest', async (req, res) => {
  const { requestId, parentId } = req.body;

  // Ensure all required fields are provided
  if (!requestId || !parentId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const realTimeDb = admin.database().ref('requests/' + parentId + '/' + requestId);
    
    // Wait for the database operation to complete
    realTimeDb.update({
      status: 'approved'
    });

    const transactionId = await realTimeDb.once('value').then((snapshot) => {
      return snapshot.val().transactionId;
    });

    await processTransaction(transactionId);

    res.status(200).json({ message: 'Request approved successfully' });
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ message: 'Failed to approve request' });
  }
});

app.post('/addRule', async (req, res) => {
  const { parentId, childId, balance, amount, operator, result } = req.body;
  //ensure all required fields are provided
  if (!parentId || !childId || !balance || !amount || !operator || !result) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  db = admin.firestore();
  const ruleRef = db.collection('rules').doc(childId);
  const ruleSnapshot = await ruleRef.get();
  const rule = {
    parentId: parentId,
    childId: childId,
    balance: balance,
    amount: amount,
    operator: operator,
    result: result
  };
  const applicableRules = ruleSnapshot.data();
  if (applicableRules) {
    ruleSnapshot.ref.update({
      rules: admin.firestore.FieldValue.arrayUnion(rule)
    });
  } else {
    ruleSnapshot.ref.set({
      rules: [rule]
    });
  }
  res.status(200).json({ message: 'Rule added successfully' });
}
);





app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

module.exports = app;
