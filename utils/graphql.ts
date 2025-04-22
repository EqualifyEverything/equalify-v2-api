import { isStaging } from '.';

export const graphql = async ({ request, query, variables = {} }) => {
    const authorization = request?.headers?.authorization;
    const userId = request?.headers['x-hasura-user-id'];
    const role = request?.headers['x-hasura-role'];
    const headers = {
        'Content-Type': 'application/json',
        ...authorization ? { authorization } : { 'x-hasura-admin-secret': process.env.DB_PASSWORD },
        ...userId && ({ 'x-hasura-user-id': userId }),
        ...role && ({ 'x-hasura-role': role }),
    };
    // console.log(JSON.stringify({ query, variables, headers }))
    const response = (await (await fetch(`https://graphql.equalify.${isStaging ? 'dev' : 'app'}/v1/graphql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
    })).json());
    if (!response?.data) {
        console.log(JSON.stringify({ graphqlError: response }));
    }
    return response?.data;
}