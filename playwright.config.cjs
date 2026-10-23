const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'./tests/ui',use:{viewport:{width:1240,height:850},headless:true,reducedMotion:'reduce',launchOptions:{args:['--no-sandbox'],...(process.env.AZADI_CHROMIUM?{executablePath:process.env.AZADI_CHROMIUM}:{})}},reporter:'list',outputDir:'.cache/ui-results'});
