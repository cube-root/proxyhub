import { debug } from './debug';

/**
 * Extract socket ID from domain with security validations
 * @param domain - The hostname/domain to extract ID from
 * @returns id - The extracted and sanitized socket ID
 */
const extractIdFromDomain = (domain: string): string | null => {
    debug('Extracting ID from domain:', domain);

    if (!domain || typeof domain !== 'string') {
        debug('Invalid domain type or null');
        return null;
    }

    const cleanDomain = domain.trim().toLowerCase();

    if (cleanDomain.length === 0 || cleanDomain.length > 253) {
        debug('Domain length validation failed');
        return null;
    }

    const domainParts = cleanDomain.split(".");

    if (domainParts.length < 2) {
        debug('Not enough domain parts');
        return null;
    }

    const subdomain = domainParts[0];

    if (!subdomain || subdomain.length === 0 || subdomain.length > 63) {
        debug('Subdomain length validation failed');
        return null;
    }

    const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!subdomainRegex.test(subdomain)) {
        debug('Subdomain regex validation failed');
        return null;
    }

    debug('Successfully extracted ID:', subdomain);
    return subdomain;
};

/**
 * Validate if a string is a valid socket ID format
 * @param socketId - The socket ID to validate
 * @returns boolean - Whether the socket ID is valid
 */
const isValidSocketId = (socketId: string): boolean => {
    if (!socketId || typeof socketId !== 'string') {
        debug('Socket ID validation failed: invalid type');
        return false;
    }

    const socketIdRegex = /^[a-z0-9]{8,64}$/i;
    const isValid = socketIdRegex.test(socketId);
    debug('Socket ID validation result:', isValid);
    return isValid;
};

export {
    extractIdFromDomain,
    isValidSocketId
};
