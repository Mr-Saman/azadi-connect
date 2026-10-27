package org.azadi.connect

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp

val Mint = Color(0xFF4EE1BC)
val Violet = Color(0xFF9B8CFF)
val Night = Color(0xFF0B101D)
private val Dark = darkColorScheme(primary = Mint, onPrimary = Night, secondary = Violet, background = Night, surface = Color(0xFF121A2B), surfaceVariant = Color(0xFF1B263B), outline = Color(0xFF2B3851), onBackground = Color(0xFFEAF1FC), onSurface = Color(0xFFEAF1FC), onSurfaceVariant = Color(0xFF9EADC6), error = Color(0xFFFF8E9E))
private val Light = lightColorScheme(primary = Color(0xFF087B62), onPrimary = Color.White, secondary = Color(0xFF6C50D8), background = Color(0xFFF3F6FC), surface = Color.White, surfaceVariant = Color(0xFFE9EEF8), outline = Color(0xFFCAD4E5), onSurfaceVariant = Color(0xFF5D6C83))
@Composable fun AzadiTheme(dark: Boolean, persian: Boolean, content: @Composable () -> Unit) {
    val font = FontFamily(Font(if (persian) R.font.vazir else R.font.inter))
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Typography(
        displaySmall = TextStyle(fontFamily = font, fontSize = 32.sp),
        headlineMedium = TextStyle(fontFamily = font, fontSize = 26.sp),
        titleLarge = TextStyle(fontFamily = font, fontSize = 22.sp),
        titleMedium = TextStyle(fontFamily = font, fontSize = 17.sp),
        titleSmall = TextStyle(fontFamily = font, fontSize = 14.sp),
        bodyLarge = TextStyle(fontFamily = font, fontSize = 16.sp),
        bodyMedium = TextStyle(fontFamily = font, fontSize = 14.sp),
        bodySmall = TextStyle(fontFamily = font, fontSize = 12.sp),
        labelLarge = TextStyle(fontFamily = font, fontSize = 14.sp),
        labelMedium = TextStyle(fontFamily = font, fontSize = 12.sp),
        labelSmall = TextStyle(fontFamily = font, fontSize = 10.sp)
    ), content = content)
}
