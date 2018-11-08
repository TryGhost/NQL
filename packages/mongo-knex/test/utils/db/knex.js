module.exports.sqlite = () => {
    const config = {
        client: 'sqlite3',
        connection: {
            filename: './test/utils/db/test.db'
        },
        useNullAsDefault: true
    };

    return require('knex')(config);
};

module.exports.mysql = (conn) => {
    const config = {
        client: 'mysql',
        useNullAsDefault: true
    };
    if (conn) {
        config.connection = conn;
    }

    return require('knex')(config);
};
