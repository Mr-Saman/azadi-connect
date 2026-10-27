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
    @Test fun bilingualNavigationAndThemePersist() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as AzadiApplication
        app.vault.update { it.copy(language = "fa", dark = true) }
        compose.waitForIdle()
        compose.onNodeWithText("اتصال، به سبک خودت.").assertIsDisplayed()
        compose.onNodeWithText("EN").performClick()
        compose.onNodeWithText("Connect on your terms.").assertIsDisplayed()
        compose.onNodeWithText("Settings", useUnmergedTree = false).performClick()
        compose.onNodeWithText("Dark appearance").assertIsDisplayed()
        compose.onNode(isToggleable()).performClick()
        compose.waitUntil(5000) { !app.vault.data.value.dark }
        compose.onNodeWithText("Apps", useUnmergedTree = false).performClick()
        compose.onNodeWithText("Every app. Your choice.").assertIsDisplayed()
    }
}
