package org.azadi.connect
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UiRuntimeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun capture(name: String) {
        compose.waitForIdle()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val folder = java.io.File(context.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        requireNotNull(bitmap).let { image -> java.io.File(folder, "$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; image.recycle() }
    }
    @Test fun bilingualNavigationAndThemePersist() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as AzadiApplication
        app.vault.update { it.copy(language = "fa", dark = true) }
        compose.waitForIdle()
        compose.onNodeWithText("اتصال، به سبک خودت.").assertIsDisplayed()
        capture("persian-dark")
        compose.onNodeWithText("EN").performClick()
        compose.waitUntil(15000) { app.vault.data.value.language == "en" }
        compose.onNodeWithText("Connect on your terms.").assertIsDisplayed()
        capture("english-dark")
        compose.onNodeWithText("Settings", useUnmergedTree = false).performClick()
        compose.onNodeWithText("Dark appearance").assertIsDisplayed()
        compose.onNode(isToggleable()).performClick()
        compose.waitUntil(15000) { !app.vault.data.value.dark }
        capture("settings-light")
        compose.onNodeWithText("Connect").performClick()
        compose.onNodeWithText("Connect on your terms.").assertIsDisplayed()
        capture("english-light")
        app.vault.update { it.copy(apps = it.apps + "org.azadi.example.missing") }
        compose.onNodeWithText("Apps", useUnmergedTree = false).performClick()
        compose.onNodeWithText("Every app. Your choice.").assertIsDisplayed()
        compose.waitUntil(15000) { compose.onAllNodesWithText("Remove selection").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("org.azadi.example.missing").assertIsDisplayed()
        compose.onNodeWithText("Remove selection").performClick()
        compose.waitUntil(15000) { "org.azadi.example.missing" !in app.vault.data.value.apps }
        capture("applications-light")
    }
}
