const SPECIFICITY: Record<string, number> = { exact: 3, prefix: 2, regex: 1 };

export function findMockMatch(
    mocks: MockDefinition[],
    requestMethod: string,
    requestPath: string,
): MockDefinition | null {
    // Strip query string from request path
    const pathOnly = requestPath.split('?')[0];
    const method = requestMethod.toUpperCase();

    const matches: MockDefinition[] = [];

    for (const mock of mocks) {
        // Filter by method
        if (mock.method !== '*' && mock.method.toUpperCase() !== method) continue;

        // Match by path type
        let matched = false;
        switch (mock.path_type) {
            case 'exact':
                matched = mock.path === pathOnly;
                break;
            case 'prefix':
                matched = pathOnly.startsWith(mock.path);
                break;
            case 'regex':
                try {
                    matched = new RegExp(mock.path).test(pathOnly);
                } catch {
                    // Invalid regex, skip
                }
                break;
        }

        if (matched) {
            matches.push(mock);
        }
    }

    if (matches.length === 0) return null;

    // Sort: highest priority first, then by specificity (exact > prefix > regex)
    matches.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (SPECIFICITY[b.path_type] || 0) - (SPECIFICITY[a.path_type] || 0);
    });

    return matches[0];
}
