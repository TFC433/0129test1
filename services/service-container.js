/**
 * services/service-container.js
 * 服務容器 (IoC Container)
 * * @version 7.2.0 (Phase B - SystemService Injection)
 * @date 2026-01-22
 * @description [Fix] 注入 SystemService，完成 System 模組分層。
 */

const config = require('../config');
const dateHelpers = require('../utils/date-helpers');

// --- Import Infrastructure Services ---
const GoogleClientService = require('./google-client-service');

// --- Import Readers ---
const ContactReader = require('../data/contact-reader');
const CompanyReader = require('../data/company-reader');
const OpportunityReader = require('../data/opportunity-reader');
const InteractionReader = require('../data/interaction-reader');
const EventLogReader = require('../data/event-log-reader');
const SystemReader = require('../data/system-reader');
const WeeklyBusinessReader = require('../data/weekly-business-reader');
const AnnouncementReader = require('../data/announcement-reader');
const ProductReader = require('../data/product-reader');

// --- Import Writers ---
const ContactWriter = require('../data/contact-writer');
const CompanyWriter = require('../data/company-writer');
const OpportunityWriter = require('../data/opportunity-writer');
const InteractionWriter = require('../data/interaction-writer');
const EventLogWriter = require('../data/event-log-writer');
const SystemWriter = require('../data/system-writer');
const WeeklyBusinessWriter = require('../data/weekly-business-writer');
const AnnouncementWriter = require('../data/announcement-writer');
const ProductWriter = require('../data/product-writer');

// --- Import Domain Services ---
const AuthService = require('./auth-service');
const DashboardService = require('./dashboard-service');
const OpportunityService = require('./opportunity-service');
const ContactService = require('./contact-service');
const CompanyService = require('./company-service');
const InteractionService = require('./interaction-service');
const EventLogService = require('./event-log-service');
const CalendarService = require('./calendar-service');
const SalesAnalysisService = require('./sales-analysis-service');
const WeeklyBusinessService = require('./weekly-business-service');
const WorkflowService = require('./workflow-service');
const ProductService = require('./product-service');
const AnnouncementService = require('./announcement-service'); 
const EventService = require('./event-service');
// [New] Import SystemService
const SystemService = require('./system-service');

// --- Import Controllers (Class Based) ---
const AuthController = require('../controllers/auth.controller');
const SystemController = require('../controllers/system.controller');
const AnnouncementController = require('../controllers/announcement.controller');
const OpportunityController = require('../controllers/opportunity.controller');
const ContactController = require('../controllers/contact.controller');
const CompanyController = require('../controllers/company.controller');
const InteractionController = require('../controllers/interaction.controller');
const ProductController = require('../controllers/product.controller');
const WeeklyController = require('../controllers/weekly.controller'); 

let services = null;

async function initializeServices() {
    if (services) return services;

    console.log('🚀 [System] 正在初始化 Service Container (v7.2.0 SystemService)...');

    try {
        // 1. Infrastructure
        const googleClientService = new GoogleClientService();
        const sheets = await googleClientService.getSheetsClient();
        const drive = await googleClientService.getDriveClient();
        const calendar = await googleClientService.getCalendarClient();

        // 2. Readers
        const contactReader = new ContactReader(sheets, config.IDS.CORE);
        const companyReader = new CompanyReader(sheets, config.IDS.CORE);
        const opportunityReader = new OpportunityReader(sheets, config.IDS.CORE);
        const interactionReader = new InteractionReader(sheets, config.IDS.CORE);
        const eventLogReader = new EventLogReader(sheets, config.IDS.CORE);
        const weeklyReader = new WeeklyBusinessReader(sheets, config.IDS.CORE);
        const announcementReader = new AnnouncementReader(sheets, config.IDS.CORE);
        const systemReader = new SystemReader(sheets, config.IDS.SYSTEM);
        const productReader = new ProductReader(sheets, config.IDS.PRODUCT);

        // 3. Writers
        const contactWriter = new ContactWriter(sheets, config.IDS.CORE, contactReader);
        const companyWriter = new CompanyWriter(sheets, config.IDS.CORE, companyReader);
        const opportunityWriter = new OpportunityWriter(sheets, config.IDS.CORE, opportunityReader, contactReader);
        const interactionWriter = new InteractionWriter(sheets, config.IDS.CORE, interactionReader);
        const eventLogWriter = new EventLogWriter(sheets, config.IDS.CORE, eventLogReader);
        const weeklyWriter = new WeeklyBusinessWriter(sheets, config.IDS.CORE, weeklyReader);
        const announcementWriter = new AnnouncementWriter(sheets, config.IDS.CORE, announcementReader);
        const systemWriter = new SystemWriter(sheets, config.IDS.SYSTEM, systemReader);
        const productWriter = new ProductWriter(sheets, config.IDS.PRODUCT, productReader);

        // 4. Domain Services
        const calendarService = new CalendarService(calendar);
        const authService = new AuthService(systemReader, systemWriter);

        // Announcement Service
        const announcementService = new AnnouncementService({
            announcementReader,
            announcementWriter
        });

        // [New] System Service
        const systemService = new SystemService(systemReader, systemWriter);

        const companyService = new CompanyService(
            companyReader, companyWriter, contactReader, contactWriter,
            opportunityReader, opportunityWriter, interactionReader, interactionWriter,
            eventLogReader, systemReader
        );
        
        const contactService = new ContactService(contactReader, contactWriter, companyReader);

        const opportunityService = new OpportunityService({
            config, 
            opportunityReader, opportunityWriter, 
            contactReader, contactWriter,
            companyReader, companyWriter, 
            interactionReader, interactionWriter,
            eventLogReader, systemReader
        });

        const interactionService = new InteractionService(interactionReader, interactionWriter, opportunityReader, companyReader);
        const eventLogService = new EventLogService(eventLogReader, eventLogWriter, opportunityReader, companyReader, systemReader, calendarService);
        
        const weeklyBusinessService = new WeeklyBusinessService({
            weeklyBusinessReader: weeklyReader, 
            weeklyBusinessWriter: weeklyWriter,
            dateHelpers,
            calendarService,
            systemReader,
            opportunityService,
            config
        });

        const salesAnalysisService = new SalesAnalysisService(opportunityReader, systemReader, config);
        const productService = new ProductService(productReader, productWriter, systemReader, systemWriter);
        
        const dashboardService = new DashboardService(
            config, opportunityReader, contactReader, interactionReader,
            eventLogReader, systemReader, weeklyBusinessService, companyReader, calendarService
        );

        const workflowService = new WorkflowService(
            opportunityService,
            interactionService,
            contactService
        );

        const eventService = new EventService(
            calendarService, 
            interactionService, 
            weeklyBusinessService, 
            opportunityService, 
            config, 
            dateHelpers
        );

        // 5. Controllers
        const authController = new AuthController(authService);
        
        // [Fix] Inject SystemService instead of Reader/Writer
        const systemController = new SystemController(systemService, dashboardService);
        
        const announcementController = new AnnouncementController(announcementService);
        const contactController = new ContactController(contactService, workflowService, contactWriter);
        const companyController = new CompanyController(companyService);
        
        const opportunityController = new OpportunityController(
            opportunityService, workflowService, dashboardService, opportunityReader, opportunityWriter
        );
        
        const interactionController = new InteractionController(interactionService);
        const productController = new ProductController(productService);
        const weeklyController = new WeeklyController(weeklyBusinessService);

        console.log('✅ Service Container 初始化完成');

        services = {
            googleClientService,
            authService, contactService, companyService,
            opportunityService, interactionService, eventLogService, calendarService,
            weeklyBusinessService, salesAnalysisService, dashboardService,
            workflowService, productService, 
            announcementService,
            eventService,
            // [New] Export SystemService
            systemService,

            // Controllers
            authController,
            systemController,
            announcementController,
            contactController,
            companyController,
            opportunityController,
            interactionController,
            productController,
            weeklyController,

            // Writers (Legacy compatibility)
            contactWriter,
            weeklyBusinessReader: weeklyReader,
            weeklyBusinessWriter: weeklyWriter,
            systemReader, systemWriter,
            interactionWriter,
            eventLogReader
        };

        return services;

    } catch (error) {
        console.error('⚠ 系統啟動失敗 (Service Container):', error.message);
        console.error(error.stack);
        throw error;
    }
}

module.exports = initializeServices;