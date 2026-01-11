const MongoStore = require('connect-mongo');
console.log('MongoStore.default:', MongoStore.default);
if (MongoStore.default) {
    console.log('MongoStore.default.create:', MongoStore.default.create);
}
