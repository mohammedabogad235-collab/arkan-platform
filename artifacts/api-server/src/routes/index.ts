import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import ordersRouter from "./orders";
import packagesRouter from "./packages";
import paymentMethodsRouter from "./payment-methods";
import testimonialsRouter from "./testimonials";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(ordersRouter);
router.use(packagesRouter);
router.use(paymentMethodsRouter);
router.use(testimonialsRouter);
router.use(adminRouter);

export default router;
