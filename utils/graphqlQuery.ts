import { event, isStaging } from '.';

export const graphqlQuery = async ({ query, variables = {} }) => {
    const Authorization = event?.headers?.authorization;
    const response = (await (await fetch(`https://graphqlv2${isStaging ? '-staging' : ''}.${process.env.URL}/v1/graphql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...Authorization ? { Authorization } : { 'x-hasura-admin-secret': process.env.DB_PASSWORD },
        },
        body: JSON.stringify({ query, variables }),
    })).json());
    if (!response?.data) {
        console.log(JSON.stringify({ graphqlError: response }));
    }
    return response?.data;
}