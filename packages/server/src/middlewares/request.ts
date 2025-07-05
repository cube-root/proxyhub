import { Request, Response, NextFunction } from 'express';
import { extractIdFromDomain, isValidSocketId } from '../utils/domain';

const RequestMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const hostname = req.hostname;
    
    // Extract socket ID from domain
    const id = extractIdFromDomain(hostname);
    
    if (!id) {
        res.status(400).json({ 
            error: 'Invalid hostname format',
            message: 'Please check your tunnel URL format'
        });
        return;
    }
    
    // Additional validation for socket ID format
    if (!isValidSocketId(id)) {
        res.status(400).json({ 
            error: 'Invalid socket ID format',
            message: 'Socket ID must be alphanumeric and between 8-64 characters'
        });
        return;
    }
    
    req.id = id;
    next();
};

export default RequestMiddleware;