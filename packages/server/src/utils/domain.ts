/**
 * Extract socket ID from domain with security validations
 * @param domain - The hostname/domain to extract ID from
 * @returns id - The extracted and sanitized socket ID
 */
const extractIdFromDomain = (domain: string): string | null => {
    console.log('Extracting ID from domain:', domain);
    
    // Basic validation
    if (!domain || typeof domain !== 'string') {
        console.log('Invalid domain type or null');
        return null;
    }
    
    // Remove any leading/trailing whitespace
    const cleanDomain = domain.trim().toLowerCase();
    console.log('Cleaned domain:', cleanDomain);
    
    // Basic domain format validation
    if (cleanDomain.length === 0 || cleanDomain.length > 253) {
        console.log('Domain length validation failed');
        return null;
    }
    
    // Split domain into parts
    const domainParts = cleanDomain.split(".");
    console.log('Domain parts:', domainParts);
    
    // We expect at least 2 parts (subdomain.domain)
    if (domainParts.length < 2) {
        console.log('Not enough domain parts');
        return null;
    }
    
    // Extract the first part (subdomain)
    const subdomain = domainParts[0];
    console.log('Extracted subdomain:', subdomain);
    
    // Validate subdomain format (alphanumeric only, max 63 chars)
    if (!subdomain || subdomain.length === 0 || subdomain.length > 63) {
        console.log('Subdomain length validation failed');
        return null;
    }
    
    // Check if subdomain contains only alphanumeric characters and hyphens
    // But not starting or ending with hyphen
    const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!subdomainRegex.test(subdomain)) {
        console.log('Subdomain regex validation failed');
        return null;
    }
    
    console.log('Successfully extracted ID:', subdomain);
    return subdomain;
};

/**
 * Validate if a string is a valid socket ID format
 * @param socketId - The socket ID to validate
 * @returns boolean - Whether the socket ID is valid
 */
const isValidSocketId = (socketId: string): boolean => {
    console.log('Validating socket ID:', socketId);
    
    if (!socketId || typeof socketId !== 'string') {
        console.log('Socket ID validation failed: invalid type');
        return false;
    }
    
    // Socket IDs should be alphanumeric, typically 20 characters
    // But we'll be flexible with length while ensuring safety
    const socketIdRegex = /^[a-z0-9]{8,64}$/i;
    const isValid = socketIdRegex.test(socketId);
    console.log('Socket ID validation result:', isValid);
    return isValid;
};

export {
    extractIdFromDomain,
    isValidSocketId
};