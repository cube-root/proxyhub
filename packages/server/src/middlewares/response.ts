import { Request, Response, NextFunction } from 'express';


const ResponseMiddleware = (req: Request, res: Response) => {
    res.end(res.locals.data);
}


export default ResponseMiddleware;